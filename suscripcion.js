// Alta, acceso y cobro de la suscripción. Todo el proceso ocurre en esta
// página; no hace falta pasar por la app en ningún momento.
//
// POR QUÉ EXISTE
// La app no puede llevar enlaces de compra: Apple (guideline 3.1.3(f)) y Google
// exigirían su compra integrada, con comisión del 15-30%. Mi Carga se publica
// bajo la excepción de «servicio multiplataforma»: se paga en la web y se entra
// en la app con la suscripción ya contratada.
//
// EL RECORRIDO
//   1. correo   → se mira si ese correo ya tiene cuenta
//   2a. alta    → si NO la tiene: se crea aquí mismo (nombre, NIF, teléfono,
//                 empresa, contraseña). Es la misma cuenta de la app.
//   2b. código  → si SÍ la tiene: entra con un código de un solo uso, sin
//                 tener que recordar la contraseña
//   3. facturación → solo lo que falte; lo que ya esté en su perfil viene puesto
//   4. planes   → a Stripe, con su identificador pegado al enlace
//
// POR QUÉ SE PUEDE DAR DE ALTA DESDE AQUÍ
// El perfil NO lo crea la app: lo crea el trigger `handle_new_user` de la base
// de datos al insertarse la fila en auth.users, leyendo `raw_user_meta_data`.
// Así que basta con mandar los mismos metadatos que manda la app y el usuario
// queda idéntico a uno registrado desde el móvil. (La primera versión de esta
// página no dejaba crear cuentas porque se dio por hecho que el alta la hacía
// la app; era falso.)
//
// DÓNDE VIVEN LAS REGLAS DEL COBRO
// No aquí. En la Edge Function `enviar-enlace-pago`, que es código de servidor
// y ya tiene sus pruebas. Esta página pregunta y obedece:
//
//   200 → enlaces personalizados listos, se pintan los dos planes
//   409 → ya tiene suscripción vigente. NO se le ofrece contratar otra: cada
//         enlace de Stripe crea una suscripción NUEVA, así que acabaría pagando
//         10 € y 90 € a la vez y la primera quedaría huérfana facturando para
//         siempre. Se le manda al portal de cliente.
//   412 → le faltan datos fiscales. Sin ellos se cobrarían 10 € con IVA español
//         sin poder emitir una factura válida. Se piden aquí mismo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

// La clave publicable es pública por diseño: va ya dentro del paquete de la app
// y del bundle de app.micarga.es. Lo que protege los datos es RLS, no ocultarla.
const SUPABASE_URL = 'https://yrwletmszkfvnpbkngek.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sOknpnTQXY0CqOMyv-UZSw_cYjp2YzO';

// Portal de cliente de Stripe, en MODO REAL (activado el 27-08-2026). Es donde
// se manda a quien ya tiene suscripción: cambiar de plan, actualizar la tarjeta,
// cancelar o descargar facturas. Nunca un enlace de pago, que crearía una
// suscripción NUEVA y cobraría dos.
// ⚠️ La MISMA URL está también en index.html. Si se cambia una, cambiar las dos.
const PORTAL_CLIENTE = 'https://billing.stripe.com/p/login/aFa9AT6nqetc4L7a6teME00';

const CAMPOS_FACTURACION = [
  'razon_social', 'nif', 'direccion', 'codigo_postal', 'poblacion', 'provincia', 'pais',
];

// Cómo se llama cada columna en pantalla. El servidor devuelve claves de
// columna a propósito (no sabe de rotulación); la traducción vive aquí.
const ROTULOS = {
  razon_social: 'la razón social',
  nif: 'el NIF / CIF',
  direccion: 'la dirección',
  codigo_postal: 'el código postal',
  poblacion: 'la población',
  provincia: 'la provincia',
  pais: 'el país',
};

// ---------------------------------------------------------------------------
// Validaciones. Copias FIELES de las de la app (src/lib/documentUtils.ts y
// src/lib/phone.ts). No se pueden importar: aquello es el bundle de la app y
// esto es otro repositorio, servido como estático.
//
// ⚠️ Si cambian allí, cambiar aquí. Se copian —y no se dejan pasar— porque un
// alta hecha desde esta página tiene que quedar EXACTAMENTE igual que una hecha
// desde el móvil: el teléfono es UNIQUE y es lo único que le permite al bot de
// WhatsApp saber quién escribe, y un NIF con la letra mal impide emitir una
// factura válida del cobro.
// ---------------------------------------------------------------------------

/** Móvil español a +34XXXXXXXXX, o null si no vale. Solo 6 y 7: WhatsApp no existe en fijos. */
const normalizarTelefono = (v) => {
  const limpio = (v || '').replace(/[\s-]/g, '');
  const sinPrefijo = limpio.replace(/^(\+34|0034|34)/, '');
  if (!/^[67]\d{8}$/.test(sinPrefijo)) return null;
  return `+34${sinPrefijo}`;
};

/** NIF, NIE o CIF español, comprobando el dígito o la letra de control. */
const nifValido = (nif) => {
  const clean = (nif || '').trim().toUpperCase();
  if (clean.length !== 9) return false;

  if (/^[0-9XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/.test(clean)) {
    let numero = clean.slice(0, 8);
    if (numero.startsWith('X')) numero = '0' + numero.slice(1);
    else if (numero.startsWith('Y')) numero = '1' + numero.slice(1);
    else if (numero.startsWith('Z')) numero = '2' + numero.slice(1);
    return 'TRWAGMYFPDXBNJZSQVHLCKE'[parseInt(numero, 10) % 23] === clean.charAt(8);
  }

  if (/^[ABCDEFGHJNPQRSTUVW][0-9]{7}[0-9A-J]$/.test(clean)) {
    const inicial = clean.charAt(0);
    const digitos = clean.slice(1, 8);
    const control = clean.charAt(8);
    let pares = 0, impares = 0;
    for (let i = 0; i < digitos.length; i++) {
      const d = parseInt(digitos.charAt(i), 10);
      if (i % 2 === 0) { const x = d * 2; impares += x > 9 ? x - 9 : x; }
      else pares += d;
    }
    const ultimo = (10 - ((pares + impares) % 10)) % 10;
    const letra = 'JABCDEFGHI'.charAt(ultimo);
    if ('KPQRSNW'.indexOf(inicial) !== -1) return control === letra;
    return control === String(ultimo) || control === letra;
  }

  return false;
};

// ---------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

const PASOS = [
  'paso-correo', 'paso-alta', 'paso-codigo',
  'paso-facturacion', 'paso-planes', 'paso-ya-suscrito',
];

/** Enseña un paso y esconde los demás. Un solo sitio que toca `hidden`. */
const mostrarPaso = (id) => {
  for (const p of PASOS) $(p).hidden = p !== id;
};

const avisar = (texto, tono = 'error') => {
  const el = $('aviso');
  el.textContent = texto;
  el.dataset.tono = tono;
  el.hidden = false;
};

const limpiarAviso = () => { $('aviso').hidden = true; };

/** Bloquea un botón mientras se espera al servidor, y lo devuelve a su sitio. */
const ocupado = async (boton, textoMientras, tarea) => {
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoMientras;
  try {
    return await tarea();
  } finally {
    boton.disabled = false;
    boton.textContent = original;
  }
};

/**
 * El código de estado HTTP de un error de supabase-js.
 *
 * Se lee de `error.context.status` y NUNCA del mensaje: @supabase/functions-js
 * manda siempre el mismo texto fijo («Edge Function returned a non-2xx status
 * code») pase lo que pase. Buscar el código dentro del mensaje es lo que
 * convirtió en código muerto la rama del 429 en la app (hallazgo APP-429).
 */
const estadoDe = (error) => error?.context?.status;

/** El cuerpo JSON de una respuesta de error, o null si no se puede leer. */
const cuerpoDe = async (error) => {
  try { return await error.context.json(); } catch { return null; }
};

// Estado del recorrido. `datosAlta` solo se rellena cuando hay que crear la
// cuenta; la contraseña se guarda aquí porque no se puede poner hasta DESPUÉS
// de verificar el código (antes no hay sesión con la que llamar a updateUser).
let correoEnCurso = '';
let datosAlta = null;

// ---------------------------------------------------------------------------
// Paso 1: el correo. ¿Existe la cuenta?
// ---------------------------------------------------------------------------

/**
 * Pide el código de acceso.
 *
 * `shouldCreateUser` decide las dos ramas: `false` para averiguar si la cuenta
 * existe (Supabase responde error si no), y `true` para crearla en el alta,
 * llevándose los metadatos que el trigger `handle_new_user` convierte en perfil.
 *
 * `emailRedirectTo`: el correo de Supabase puede traer un CÓDIGO,
 * un ENLACE, o los dos, según la plantilla del panel: el código solo existe si
 * la plantilla incluye `{{ .Token }}`. Como no se puede dar por hecho, se cubren
 * las dos vías. ⚠️ Esta URL tiene que estar en la lista de redirecciones
 * permitidas de Supabase (Authentication → URL Configuration).
 */
const pedirCodigo = (email, crear, metadatos) =>
  supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: crear,
      emailRedirectTo: 'https://micarga.es/suscripcion',
      ...(metadatos ? { data: metadatos } : {}),
    },
  });

/**
 * ¿El error de Supabase significa «ese correo no tiene cuenta»?
 *
 * Se mira el CÓDIGO, no el mensaje. Leer el texto del mensaje es exactamente el
 * fallo que este proyecto ya documentó como APP-429: una rama que dejó de
 * ejecutarse en silencio porque cambió una cadena de texto. Y aquí sería peor,
 * porque esta rama es la que da de alta a los clientes nuevos: si dejara de
 * reconocerse, a TODO visitante que no tenga cuenta se le diría «no hemos
 * podido enviarte el código» y el alta desaparecería sin que saltara nada.
 *
 * Comprobado contra el servidor el 07-09-2026: la respuesta real es
 *   HTTP 422 · {"code":422,"error_code":"otp_disabled","msg":"Signups not allowed for otp"}
 *
 * Se leen los tres sitios donde puede acabar ese código porque depende de la
 * versión de supabase-js: las nuevas lo exponen como `error.code`, las
 * anteriores no lo mapean y solo dejan `status`. El texto se conserva como
 * último recurso, ya solo de red de seguridad.
 */
const esCuentaInexistente = (error) => {
  if (!error) return false;
  const codigo = error.code || error.error_code;
  if (codigo === 'otp_disabled') return true;
  // 422 en esta llamada solo se da por este motivo: un correo mal escrito es
  // 400, y la falta de permisos, 401.
  if (error.status === 422) return true;
  return /signups? not allowed|user not found/i.test(error.message || '');
};

const irAPasoCodigo = (email) => {
  $('ayuda-codigo').textContent =
    `Te hemos escrito a ${email}. Copia aquí el código; si el ` +
    `correo trae un enlace, pulsándolo también entras. Si no lo ves, mira en spam.`;
  mostrarPaso('paso-codigo');
  $('codigo').focus();
};

$('form-correo').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const correo = $('correo').value.trim();
  if (!correo) return;

  await ocupado($('btn-correo'), 'Comprobando…', async () => {
    const { error } = await pedirCodigo(correo, false);
    correoEnCurso = correo;

    if (error) {
      if (esCuentaInexistente(error)) {
        // No hay cuenta: se crea aquí, sin mandar a nadie a la app.
        datosAlta = null;
        $('alta-correo').textContent = correo;
        mostrarPaso('paso-alta');
        return;
      }
      avisar('No hemos podido enviarte el código. Inténtalo de nuevo en un minuto.');
      return;
    }

    datosAlta = null;
    irAPasoCodigo(correo);
  });
});

// ---------------------------------------------------------------------------
// Paso 1 bis: alta de cuenta nueva
// ---------------------------------------------------------------------------

$('btn-alta-otro-correo').addEventListener('click', () => {
  limpiarAviso();
  mostrarPaso('paso-correo');
  $('correo').focus();
  $('correo').select();
});

$('form-alta').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const f = $('form-alta');
  const val = (n) => (f.elements[n].value || '').trim();

  for (const campo of ['first_name', 'last_name', 'nif_cif', 'company_name', 'phone', 'password']) {
    if (val(campo) === '') { avisar('Rellena todos los campos para crear la cuenta.'); return; }
  }
  if (!f.elements['acepto'].checked) {
    avisar('Para crear la cuenta hay que aceptar los términos y la política de privacidad.');
    return;
  }
  if (val('password').length < 6) {
    avisar('La contraseña necesita al menos 6 caracteres.');
    return;
  }
  if (!nifValido(val('nif_cif'))) {
    avisar('Ese NIF/CIF no es válido. Comprueba que la letra coincide con los números.');
    f.elements['nif_cif'].dataset.mal = 'si';
    return;
  }
  delete f.elements['nif_cif'].dataset.mal;

  const telefono = normalizarTelefono(val('phone'));
  if (!telefono) {
    avisar('El teléfono no es válido. Escribe un móvil español de 9 dígitos que empiece por 6 o 7.');
    f.elements['phone'].dataset.mal = 'si';
    return;
  }
  delete f.elements['phone'].dataset.mal;

  await ocupado($('btn-alta'), 'Creando…', async () => {
    // Los mismos metadatos que manda la app: el trigger handle_new_user los
    // convierte en la fila de `profiles`. Si esta lista se queda corta, el
    // usuario acaba con un perfil a medias.
    const metadatos = {
      first_name: val('first_name'),
      last_name: val('last_name'),
      nif_cif: val('nif_cif').toUpperCase(),
      company_name: val('company_name'),
      phone: telefono,
    };

    const { error } = await pedirCodigo(correoEnCurso, true, metadatos);
    if (error) {
      // El teléfono es UNIQUE en `profiles`: si ya está usado, el trigger falla
      // y GoTrue lo devuelve como un error genérico de base de datos. Es el
      // motivo de fallo más probable aquí con diferencia, así que se nombra.
      const duplicado = /database error|duplicate|unique/i.test(error.message || '');
      avisar(duplicado
        ? 'No hemos podido crear la cuenta. Lo más probable es que ese teléfono ya esté registrado con otro correo. Prueba con otro número o escríbenos a soporte@micarga.es.'
        : 'No hemos podido crear la cuenta. Inténtalo de nuevo en un minuto.');
      return;
    }

    // Se guarda para ponerla en cuanto haya sesión: updateUser necesita estar
    // dentro, y aquí todavía no lo estamos.
    datosAlta = { password: val('password') };
    irAPasoCodigo(correoEnCurso);
  });
});

// ---------------------------------------------------------------------------
// Paso 2: el código
// ---------------------------------------------------------------------------

$('btn-otro-correo').addEventListener('click', () => {
  limpiarAviso();
  $('codigo').value = '';
  datosAlta = null;
  mostrarPaso('paso-correo');
  $('correo').focus();
});

$('form-codigo').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const token = $('codigo').value.replace(/\D/g, '');
  // La longitud NO se fija aquí: la decide Supabase en su configuración
  // (Authentication → Sign In / Providers → longitud del OTP), y puede ir de 6
  // a 10 dígitos. Estaba clavada en 6 y el servidor manda 8, así que el código
  // bueno se rechazaba con «El código son 6 dígitos» — y el `maxlength` del
  // formulario ni siquiera dejaba teclear el octavo. Comprobado con un correo
  // real el 07-09-2026. Quien decide de verdad si el código vale es
  // verifyOtp(); esto solo evita mandar al servidor algo obviamente corto.
  if (token.length < 6 || token.length > 10) {
    avisar('Copia el código entero, tal y como viene en el correo.');
    return;
  }

  await ocupado($('btn-codigo'), 'Comprobando…', async () => {
    const { error } = await supabase.auth.verifyOtp({
      email: correoEnCurso, token, type: 'email',
    });
    if (error) {
      avisar('El código no es correcto o ha caducado. Pide uno nuevo.');
      return;
    }

    // Cuenta recién creada: se le pone la contraseña que eligió. Sin esto
    // entraría aquí pero NO podría entrar en la app, que pide correo y
    // contraseña. Si falla, no se corta el proceso —ya está dentro y puede
    // pagar—; se le dice que use «he olvidado mi contraseña» en la app.
    if (datosAlta?.password) {
      const { error: errPass } = await supabase.auth.updateUser({ password: datosAlta.password });
      if (errPass) {
        avisar('Tu cuenta está creada, pero no hemos podido guardar la contraseña. Podrás ponerla desde la app con «¿Has olvidado tu contraseña?». Seguimos con el pago.', 'info');
      }
      datosAlta = null;
    }

    await pedirEnlaces();
  });
});

// ---------------------------------------------------------------------------
// Paso 3: datos de facturación
// ---------------------------------------------------------------------------

/**
 * Rellena el formulario con lo que ya se sabe del cliente.
 *
 * Primero lo que tenga guardado en `datos_facturacion`. Lo que falte se
 * completa con su perfil: la razón social a partir de la empresa (o del nombre,
 * si es autónomo sin empresa) y el NIF del que dio al registrarse. Es lo que
 * evita volver a pedirle cosas que ya escribió.
 */
const precargarFacturacion = async (userId) => {
  const form = $('form-facturacion');

  const [{ data: fac }, { data: perfil }] = await Promise.all([
    supabase.from('datos_facturacion').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('first_name, last_name, nif_cif, company_name').eq('id', userId).maybeSingle(),
  ]);

  const poner = (campo, valor) => {
    const control = form.elements[campo];
    if (control && !control.value && typeof valor === 'string' && valor.trim() !== '') {
      control.value = valor.trim();
    }
  };

  for (const campo of [...CAMPOS_FACTURACION, 'email_facturacion']) {
    if (fac && typeof fac[campo] === 'string') poner(campo, fac[campo]);
  }

  if (perfil) {
    const nombreCompleto = [perfil.first_name, perfil.last_name].filter(Boolean).join(' ');
    poner('razon_social', perfil.company_name || nombreCompleto);
    poner('nif', perfil.nif_cif);
  }
};

/** Marca en rojo los campos que el servidor ha rechazado. */
const marcarProblemas = (problemas) => {
  const form = $('form-facturacion');
  for (const campo of [...CAMPOS_FACTURACION, 'email_facturacion']) {
    if (form.elements[campo]) delete form.elements[campo].dataset.mal;
  }
  const nombres = [];
  for (const p of problemas || []) {
    const control = form.elements[p.campo];
    // Solo se marca en rojo lo que de verdad está vacío o mal en pantalla: un
    // campo que acabamos de precargar y ya tiene valor no debe salir en rojo.
    if (control && !control.value.trim()) control.dataset.mal = 'si';
    if (ROTULOS[p.campo] && !(control && control.value.trim())) nombres.push(ROTULOS[p.campo]);
  }
  avisar(nombres.length > 0
    ? `Para poder emitirte la factura falta ${nombres.join(', ')}.`
    : 'Revisa los datos de facturación: hay algo que no cuadra.', 'info');
};

$('form-facturacion').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    avisar('Se ha cerrado la sesión. Vuelve a entrar con tu correo.');
    mostrarPaso('paso-correo');
    return;
  }

  const form = $('form-facturacion');
  const fila = { user_id: user.id };
  for (const campo of CAMPOS_FACTURACION) {
    fila[campo] = (form.elements[campo].value || '').trim();
  }
  if (!nifValido(fila.nif)) {
    avisar('Ese NIF/CIF no es válido. Comprueba que la letra coincide con los números.');
    form.elements['nif'].dataset.mal = 'si';
    return;
  }
  delete form.elements['nif'].dataset.mal;

  const emailFactura = (form.elements['email_facturacion'].value || '').trim();
  // Vacío se guarda como null y no como cadena vacía: la columna es opcional y
  // una cadena vacía haría creer que hay un correo de facturación puesto.
  fila.email_facturacion = emailFactura === '' ? null : emailFactura;

  await ocupado($('btn-facturacion'), 'Guardando…', async () => {
    const { error } = await supabase
      .from('datos_facturacion')
      .upsert(fila, { onConflict: 'user_id' });
    if (error) {
      avisar('No hemos podido guardar tus datos. Inténtalo de nuevo.');
      return;
    }
    // Se vuelve a preguntar al servidor en vez de dar por bueno el guardado:
    // el que decide si se puede cobrar es él, y si su criterio y el de esta
    // página discreparan, el cliente se quedaría dando vueltas sin saber por
    // qué. Que lo diga quien manda.
    await pedirEnlaces();
  });
});

// ---------------------------------------------------------------------------
// Paso 4: pedir los enlaces y pintar los planes
// ---------------------------------------------------------------------------

/**
 * ¿Es una URL a la que se puede mandar a alguien?
 *
 * Los enlaces vienen de nuestra propia función, así que son de fiar; esto
 * protege de una variable de entorno mal puesta en Stripe, no de un atacante.
 * Sin la comprobación, un valor como `javascript:…` guardado por error en el
 * secreto acabaría siendo el href de un botón que el cliente pulsa.
 */
const enlaceUsable = (url) => {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
};

/**
 * Decide qué se le enseña a quien ya tiene suscripción.
 *
 * El portal de cliente de Stripe SOLO sirve a quien pagó por Stripe. Una
 * cuenta activada a mano desde el panel de administración no existe como
 * cliente allí: el portal le pide el correo, no encuentra a nadie y no le
 * manda ningún enlace. El usuario se queda esperando un correo que no va a
 * llegar y cree que algo se ha roto. Pasó de verdad el 07-09-2026.
 *
 * Se mira `stripe_customer_id`, que es lo que escribe el webhook al cobrar: si
 * está, hubo un pago de verdad y el portal funcionará.
 *
 * Ante la duda —un fallo al leer el perfil— NO se enseña el portal: es mejor
 * quedarse corto que mandar a alguien a una puerta que no abre.
 */
const prepararYaSuscrito = async () => {
  let clienteStripe = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle();
      clienteStripe = data?.stripe_customer_id ?? null;
    }
  } catch {
    clienteStripe = null;
  }

  if (clienteStripe) {
    $('btn-portal').href = PORTAL_CLIENTE;
    $('bloque-portal').hidden = false;
    $('nota-sin-portal').hidden = true;
  } else {
    $('bloque-portal').hidden = true;
    $('nota-sin-portal').hidden = false;
  }
};

const pedirEnlaces = async () => {
  limpiarAviso();

  const { data, error } = await supabase.functions.invoke('enviar-enlace-pago', {
    body: { modo: 'url' },
  });

  if (error) {
    const status = estadoDe(error);

    if (status === 409) {
      // Ya paga: esto es el final del recorrido, no una escala. Lo único que
      // queda por decidir es si tiene sentido ofrecerle el portal de Stripe.
      await prepararYaSuscrito();
      mostrarPaso('paso-ya-suscrito');
      return;
    }

    if (status === 412) {
      const cuerpo = await cuerpoDe(error);
      const { data: { user } } = await supabase.auth.getUser();
      mostrarPaso('paso-facturacion');
      if (user) await precargarFacturacion(user.id);
      marcarProblemas(cuerpo?.problemas);
      return;
    }

    if (status === 401) {
      avisar('Se ha cerrado la sesión. Vuelve a entrar con tu correo.');
      mostrarPaso('paso-correo');
      return;
    }

    avisar('Ahora mismo no podemos completar la contratación. Escríbenos a soporte@micarga.es o por WhatsApp al +34 744 716 449 y lo activamos nosotros.');
    mostrarPaso('paso-correo');
    return;
  }

  if (!enlaceUsable(data?.enlaceMensual) || !enlaceUsable(data?.enlaceAnual)) {
    avisar('Ahora mismo no podemos completar la contratación. Escríbenos a soporte@micarga.es y lo activamos nosotros.');
    mostrarPaso('paso-correo');
    return;
  }

  $('plan-mensual').href = data.enlaceMensual;
  $('plan-anual').href = data.enlaceAnual;
  mostrarPaso('paso-planes');
};

// ---------------------------------------------------------------------------
// Arranque: si ya hay sesión en este navegador, no se vuelve a pedir el código
// ---------------------------------------------------------------------------

(async () => {
  // El correo puede venir puesto en la dirección: la app manda aquí al
  // conductor con `?correo=…` para que no tenga que teclear su dirección en un
  // móvil dentro de una cabina. Solo se RELLENA, nunca se envía solo: enviarlo
  // al cargar la página dispararía un correo con un código a cualquiera que
  // abriese el enlace, incluido un buscador siguiéndolo.
  try {
    const correoEnLaUrl = new URL(location.href).searchParams.get('correo');
    if (correoEnLaUrl) $('correo').value = correoEnLaUrl.trim();
  } catch {
    // Dirección rara: se ignora y se pide el correo como siempre.
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session) await pedirEnlaces();
})();
