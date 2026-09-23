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
import { montarTurnstile } from './turnstile.js';

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
  razon_social: 'la raó social',
  nif: 'el NIF / CIF',
  direccion: 'l\'adreça',
  codigo_postal: 'el codi postal',
  poblacion: 'la població',
  provincia: 'la província',
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

// El escudo de los envíos que hacen que Supabase mande un correo. Mientras no
// haya clave configurada, `vale()` devuelve `undefined` y todo va como antes.
// Se monta una sola vez y sirve a los dos formularios que mandan correo: el del
// código y el del alta. Son pasos distintos de la misma página y nunca están
// los dos a la vez en pantalla, así que un widget basta.
let vale = async () => undefined;
(() => {
  const escudo = document.getElementById('turnstile');
  // Visible ANTES de pintarlo: Turnstile no se dibuja bien dentro de un
  // `display:none`. La página arranca en el paso del correo, que es uno de los
  // que lo llevan; si no lo fuera, el `mostrarPaso` de después lo recoloca.
  escudo.hidden = false;
  montarTurnstile(escudo).then((f) => {
    if (!f) { escudo.hidden = true; return; }
    vale = f;
    escudo.dataset.montado = 'si';
    mostrarPaso(pasoActual);
  });
})();

const $ = (id) => document.getElementById(id);

const PASOS = [
  'paso-correo', 'paso-alta', 'paso-codigo',
  'paso-facturacion', 'paso-planes', 'paso-ya-suscrito',
];

/** En qué pasos tiene sentido enseñar el widget de Turnstile. */
const PASOS_CON_ESCUDO = new Set(['paso-correo', 'paso-alta', 'paso-codigo']);

/** Enseña un paso y esconde los demás. Un solo sitio que toca `hidden`. */
let pasoActual = PASOS[0];

const mostrarPaso = (id) => {
  for (const p of PASOS) $(p).hidden = p !== id;
  pasoActual = id;
  // El widget vive fuera de los pasos —es uno solo para los tres formularios
  // que llaman a Auth— así que se esconde a mano cuando ya no pinta nada. Solo
  // se enseña si está montado: sin clave configurada no hay nada que enseñar.
  const escudo = $('turnstile');
  if (escudo?.dataset.montado === 'si') escudo.hidden = !PASOS_CON_ESCUDO.has(id);
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
const pedirCodigo = async (email, crear, metadatos) =>
  supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: crear,
      emailRedirectTo: 'https://micarga.es/suscripcion',
      captchaToken: await vale(),
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
  // Plegado otra vez: si alguien probó la contraseña, falló y volvió a pedir
  // código, el campo se quedaba abierto con la contraseña equivocada dentro.
  $('bloque-contrasena').hidden = true;
  $('btn-usar-contrasena').hidden = false;
  $('contrasena').value = '';
  $('ayuda-codigo').textContent =
    `T'hem escrit a ${email}. Copia aquí el codi; si el ` +
    `correu porta un enllaç, prement-lo també hi entres. Si no el veus, mira a la carpeta de correu brossa.`;
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
      avisar('No t\'hem pogut enviar el codi. Torna-ho a provar d\'aquí a un minut.');
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
    avisar('Per crear el compte cal acceptar els termes i la política de privacitat.');
    return;
  }
  if (val('password').length < 6) {
    avisar('La contrasenya necessita com a mínim 6 caràcters.');
    return;
  }
  if (!nifValido(val('nif_cif'))) {
    avisar('Aquest NIF/CIF no és vàlid. Comprova que la lletra coincideix amb els números.');
    f.elements['nif_cif'].dataset.mal = 'si';
    return;
  }
  delete f.elements['nif_cif'].dataset.mal;

  const telefono = normalizarTelefono(val('phone'));
  if (!telefono) {
    avisar('El telèfon no és vàlid. Escriu un mòbil espanyol de 9 dígits que comenci per 6 o 7.');
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

    // `signUp` y no `signInWithOtp`: crea la cuenta CON la contraseña de una
    // vez y, si Supabase no exige confirmar el correo, devuelve sesión al
    // instante. Antes esto mandaba un código de 6-8 dígitos y obligaba a
    // teclearlo — a alguien que acababa de escribir su propio correo y elegir
    // su propia contraseña, y justo en el momento de pagar. El cliente de un
    // socio se atascó ahí el 10-09-2026 y esa fue la razón del cambio.
    //
    // Se cubren LAS DOS configuraciones a propósito: si «Confirm email» sigue
    // activado en Supabase, `signUp` no devuelve sesión y se cae al paso del
    // código como antes. Así el cambio no depende de que el ajuste del panel se
    // toque a la vez que se despliega esto. Es el mismo patrón que ya usa la
    // app en src/App.tsx.
    const { data, error } = await supabase.auth.signUp({
      email: correoEnCurso,
      password: val('password'),
      options: {
        data: metadatos,
        emailRedirectTo: 'https://micarga.es/suscripcion',
        captchaToken: await vale(),
      },
    });
    if (error) {
      // El teléfono es UNIQUE en `profiles`: si ya está usado, el trigger falla
      // y GoTrue lo devuelve como un error genérico de base de datos. Es el
      // motivo de fallo más probable aquí con diferencia, así que se nombra.
      const duplicado = /database error|duplicate|unique/i.test(error.message || '');
      avisar(duplicado
        ? 'No hem pogut crear el compte. El més probable és que aquest telèfon ja estigui registrat amb un altre correu. Prova amb un altre número o escriu-nos a soporte@micarga.es.'
        : 'No hem pogut crear el compte. Torna-ho a provar d\'aquí a un minut.');
      return;
    }

    datosAlta = null;
    if (data?.session) {
      // Cuenta creada y dentro: directo a facturación o a los planes.
      await pedirEnlaces();
      return;
    }
    // Supabase exige confirmar el correo: no queda otra que el código.
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

// Quien ya tiene cuenta puede entrar con su contraseña en vez de esperar al
// código. El código NO se quita aquí: es lo que impide que cualquiera teclee
// el correo de un cliente y se lleve su razón social, su NIF y su dirección,
// que es lo que la página precarga en cuanto reconoce la cuenta. Lo que se
// quita es la OBLIGACIÓN de usarlo: quien se acuerda de su contraseña entra
// directo, y quien no, sigue teniendo el código.
$('btn-usar-contrasena').addEventListener('click', () => {
  limpiarAviso();
  $('bloque-contrasena').hidden = false;
  $('btn-usar-contrasena').hidden = true;
  $('contrasena').focus();
});

$('form-contrasena').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const password = $('contrasena').value;
  if (!password) return;

  await ocupado($('btn-contrasena'), 'Entrando…', async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: correoEnCurso, password,
      // Entrar con contraseña no manda ningún correo, pero Turnstile en
      // Supabase se activa para TODO Auth, no por formulario: si este envío
      // fuera sin vale, dejaría de funcionar el día que se ponga la clave.
      options: { captchaToken: await vale() },
    });
    if (error) {
      avisar('Aquesta contrasenya no és correcta. Torna-ho a provar o fes servir el codi que t\'hem enviat per correu.');
      return;
    }
    datosAlta = null;
    await pedirEnlaces();
  });
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
    avisar('Copia el codi sencer, tal com ve al correu.');
    return;
  }

  await ocupado($('btn-codigo'), 'Comprobando…', async () => {
    const { error } = await supabase.auth.verifyOtp({
      email: correoEnCurso, token, type: 'email',
    });
    if (error) {
      avisar('El codi no és correcte o ha caducat. Demana\'n un de nou.');
      return;
    }

    // Cuenta recién creada: se le pone la contraseña que eligió. Sin esto
    // entraría aquí pero NO podría entrar en la app, que pide correo y
    // contraseña. Si falla, no se corta el proceso —ya está dentro y puede
    // pagar—; se le dice que use «he olvidado mi contraseña» en la app.
    if (datosAlta?.password) {
      const { error: errPass } = await supabase.auth.updateUser({ password: datosAlta.password });
      if (errPass) {
        avisar('El teu compte està creat, però no hem pogut desar la contrasenya. La podràs posar des de l\'app amb «Has oblidat la contrasenya?». Continuem amb el pagament.', 'info');
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
    : 'Revisa les dades de facturació: hi ha alguna cosa que no quadra.', 'info');
};

$('form-facturacion').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    avisar('S\'ha tancat la sessió. Torna a entrar amb el teu correu.');
    mostrarPaso('paso-correo');
    return;
  }

  const form = $('form-facturacion');
  const fila = { user_id: user.id };
  for (const campo of CAMPOS_FACTURACION) {
    fila[campo] = (form.elements[campo].value || '').trim();
  }
  if (!nifValido(fila.nif)) {
    avisar('Aquest NIF/CIF no és vàlid. Comprova que la lletra coincideix amb els números.');
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
      avisar('No hem pogut desar les teves dades. Torna-ho a provar.');
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
      avisar('S\'ha tancat la sessió. Torna a entrar amb el teu correu.');
      mostrarPaso('paso-correo');
      return;
    }

    avisar('Ara mateix no podem completar la contractació. Escriu-nos a soporte@micarga.es o per WhatsApp al +34 744 716 449 i ho activem nosaltres.');
    mostrarPaso('paso-correo');
    return;
  }

  if (!enlaceUsable(data?.enlaceMensual) || !enlaceUsable(data?.enlaceAnual)) {
    avisar('Ara mateix no podem completar la contractació. Escriu-nos a soporte@micarga.es i ho activem nosaltres.');
    mostrarPaso('paso-correo');
    return;
  }

  // Los enlaces fijos ya no se usan para contratar —solo saben vender UNA
  // licencia— pero se siguen pidiendo porque es esta llamada la que dice si
  // la persona ya paga (409) o le faltan datos fiscales (412). Lo que se
  // pinta viene de `crear-sesion-pago`.
  prepararCantidad();
  mostrarPaso('paso-planes');
};

// ---------------------------------------------------------------------------
// Cuántas licencias, cuánto cuesta y a pagar
// ---------------------------------------------------------------------------
//
// ⚠️ AQUÍ NO SE ESCRIBE NI UNA PALABRA VISIBLE, SOLO CIFRAS. El texto vive en
// suscripcion.html, que es lo que traduce el generador de idiomas; una frase
// montada desde aquí saldría en castellano en los ocho.
//
// Y los precios salen de los `data-` del HTML, no de constantes de este
// archivo: si mañana suben, se cambian en un sitio.

const MAXIMO_LICENCIAS = 100;

/** Las cifras, con el separador decimal del idioma en el que esté la página. */
const dinero = (n) =>
  new Intl.NumberFormat(document.documentElement.lang || 'es', {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);

const leerCantidad = () => {
  const campo = $('sus-conductores');
  let n = parseInt(campo.value, 10);
  if (!Number.isInteger(n) || n < 1) n = 1;
  if (n > MAXIMO_LICENCIAS) n = MAXIMO_LICENCIAS;
  return n;
};

const pintarPrecios = () => {
  const caja = document.querySelector('[data-precios]');
  if (!caja) return;
  const p = caja.dataset;
  const n = leerCantidad();
  const crm = $('sus-crm').checked;
  const iva = 1 + Number(p.iva) / 100;

  const mes = n * Number(p.licMes) + (crm ? Number(p.crmMes) : 0);
  const ano = n * Number(p.licAno) + (crm ? Number(p.crmAno) : 0);

  const pon = (sel, valor) => {
    const e = document.querySelector(sel);
    if (e) e.textContent = valor;
  };
  pon('[data-total-mes]', dinero(mes));
  pon('[data-total-ano]', dinero(ano));
  // El IVA se redondea a céntimos ANTES de enseñarlo: es lo que va a cobrar
  // Stripe, y una diferencia de un céntimo entre lo que pone aquí y lo que
  // sale en la pasarela es una llamada a soporte.
  pon('[data-iva-mes]', dinero(Math.round(mes * iva * 100) / 100));
  pon('[data-iva-ano]', dinero(Math.round(ano * iva * 100) / 100));
  pon('[data-n-licencias]', String(n));

  const desglose = document.querySelector('[data-desglose]');
  if (desglose) desglose.hidden = n === 1 && !crm;
};

/**
 * Deja la pantalla con lo que ya contestó en la calculadora de la portada.
 *
 * Los valores llegan por la interrogación de la URL y se validan igual que si
 * viniesen de un desconocido: acaban en un cobro recurrente. `licencias` solo
 * se acepta como un entero de 1 a 100.
 */
const prepararCantidad = () => {
  const params = new URLSearchParams(location.search);
  const pedidas = params.get('licencias');
  if (/^\d{1,3}$/.test(pedidas || '')) {
    const n = Number(pedidas);
    if (n >= 1 && n <= MAXIMO_LICENCIAS) $('sus-conductores').value = String(n);
  }
  if (params.get('crm') === '1') $('sus-crm').checked = true;
  pintarPrecios();
};

/** Pide la sesión de pago y manda a Stripe. */
const contratar = async (periodo, boton) => {
  limpiarAviso();
  boton.disabled = true;

  const { data, error } = await supabase.functions.invoke('crear-sesion-pago', {
    body: { periodo, licencias: leerCantidad(), crm: $('sus-crm').checked },
  });

  if (error) {
    boton.disabled = false;
    const status = estadoDe(error);
    const cuerpo = await cuerpoDe(error);

    if (status === 409 && cuerpo?.codigo === 'ya-suscrita') {
      await prepararYaSuscrito();
      mostrarPaso('paso-ya-suscrito');
      return;
    }
    if (status === 401) {
      avisar('S\'ha tancat la sessió. Torna a entrar amb el teu correu.');
      mostrarPaso('paso-correo');
      return;
    }
    // El resto —demasiadas licencias, varias empresas, precios mal
    // configurados— trae un mensaje pensado para leerse, así que se enseña
    // tal cual en vez de taparlo con uno genérico.
    avisar(cuerpo?.error || 'Ara mateix no podem completar la contractació. Escriu-nos a soporte@micarga.es o per WhatsApp al +34 744 716 449 i ho activem nosaltres.');
    return;
  }

  if (!enlaceUsable(data?.url)) {
    boton.disabled = false;
    avisar('Ara mateix no podem completar la contractació. Escriu-nos a soporte@micarga.es i ho activem nosaltres.');
    return;
  }

  // El botón se queda apagado a propósito mientras salta a Stripe: un segundo
  // clic abriría una segunda sesión de pago.
  location.href = data.url;
};

// Los mandos del contador y los dos botones de contratar.
//
// Se atan al cargar y no al enseñar el paso: el paso se enseña y se esconde
// varias veces —al volver de facturación, por ejemplo— y atarlos allí dejaría
// un oyente nuevo cada vez, así que un solo clic acabaría pidiendo tres
// sesiones de pago.
const cantidad = $('sus-conductores');
if (cantidad) {
  const mover = (paso) => {
    cantidad.value = String(Math.min(MAXIMO_LICENCIAS, Math.max(1, leerCantidad() + paso)));
    pintarPrecios();
  };
  document.querySelector('[data-menos]')?.addEventListener('click', () => mover(-1));
  document.querySelector('[data-mas]')?.addEventListener('click', () => mover(1));
  // `input` y no `change`: el precio tiene que moverse mientras se teclea, no
  // al salir del campo.
  cantidad.addEventListener('input', pintarPrecios);
  // Al salir se corrige lo que se haya escrito —un 0, un 500, vacío— para que
  // lo que se ve en pantalla sea lo que se va a cobrar.
  cantidad.addEventListener('blur', () => {
    cantidad.value = String(leerCantidad());
    pintarPrecios();
  });
  $('sus-crm')?.addEventListener('change', pintarPrecios);

  $('plan-anual')?.addEventListener('click', (e) => contratar('anual', e.currentTarget));
  $('plan-mensual')?.addEventListener('click', (e) => contratar('mensual', e.currentTarget));
}

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
