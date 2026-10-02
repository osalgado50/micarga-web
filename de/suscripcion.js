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
//   409 → ya tiene suscripción vigente. NO se le ofrece contratar otra para
//         él: cada enlace de Stripe crea una suscripción NUEVA, así que
//         acabaría pagando 10 € y 90 € a la vez y la primera quedaría huérfana
//         facturando para siempre. Se le manda al portal de cliente.
//         Lo que SÍ se le ofrece es contratar para su EMPRESA (licencias o el
//         CRM): su suscripción personal se mantiene y la empresa contrata
//         aparte (auditoría 02-10-2026, COB-16, decisión «convivir»). Quien
//         decide si esa empresa puede contratar es `crear-sesion-pago`, que
//         mira la organización y no a la persona.
//   412 → le faltan datos fiscales. Sin ellos se cobrarían 10 € con IVA español
//         sin poder emitir una factura válida. Se piden aquí mismo.

// supabase-js servido desde la propia web, no desde esm.sh (auditoría
// 02-10-2026, SEG-07 y SEG-53): ver la cabecera de vendor/.
import { createClient } from '/vendor/supabase-js-2.39.8.js';
// La dirección y la clave, del único sitio donde están escritas (REL-18).
import { SUPABASE_URL, SUPABASE_KEY } from '/config.js?v=20261002a';
// Con ?v= como cualquier otro script (auditoría 02-10-2026, INV-10 y REN-13):
// sin él, un arreglo de turnstile.js dependía SOLO de la caché corta de
// _headers. Al cambiar turnstile.js, subir este número.
import { montarTurnstile } from './turnstile.js?v=20261002c';

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
  razon_social: 'den Firmennamen',
  nif: 'die Steuernummer (NIF / CIF)',
  direccion: 'die Adresse',
  codigo_postal: 'die Postleitzahl',
  poblacion: 'den Ort',
  provincia: 'die Provinz',
  pais: 'das Land',
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

/**
 * Qué le falta a la ficha de facturación para poder cobrar.
 *
 * Copia FIEL de problemasFacturacion() de la Edge Function `enviar-enlace-pago`
 * (logic.ts): mismos campos, código postal de 5 dígitos y país ES, con la
 * misma forma `{ campo, motivo }` que devuelve su 412. Hace falta aquí solo
 * para quien ya paga su licencia y contrata para su empresa (COB-16): a esa
 * persona `enviar-enlace-pago` le responde 409 ANTES de mirar sus datos
 * fiscales, así que sin esta comprobación llegaría a pagar sin poder recibir
 * una factura válida. ⚠️ Si cambia allí, cambiar aquí.
 */
const problemasFacturacion = (fila) => {
  const problemas = [];
  for (const campo of CAMPOS_FACTURACION) {
    const v = fila?.[campo];
    if (typeof v !== 'string' || v.trim() === '') problemas.push({ campo, motivo: 'falta' });
  }
  const vacio = (campo) => problemas.some((p) => p.campo === campo);
  if (!vacio('codigo_postal') && !/^\d{5}$/.test(String(fila.codigo_postal).trim())) {
    problemas.push({ campo: 'codigo_postal', motivo: 'formato' });
  }
  if (!vacio('pais') && String(fila.pais).trim().toUpperCase() !== 'ES') {
    problemas.push({ campo: 'pais', motivo: 'formato' });
  }
  return problemas;
};

// ---------------------------------------------------------------------------
// El idioma de la página y la vuelta desde el enlace del correo
// ---------------------------------------------------------------------------

/** El idioma de esta copia de la página: lo pone el generador en <html lang>. */
const IDIOMA = (document.documentElement.lang || 'es').slice(0, 2);

/**
 * La vuelta al idioma de la persona cuando entra por el ENLACE del correo.
 *
 * El enlace de Supabase lleva a https://micarga.es/suscripcion, en castellano,
 * venga de la página que venga: es la única dirección que hoy está en la lista
 * de redirecciones permitidas, y una que no esté manda a la persona a la URL
 * del sitio (la app), que es peor. Así que quien pide el código desde /de/ o
 * /pl/ volvía en castellano (auditoría 02-10-2026, REL-22).
 *
 * Arreglo sin tocar el panel: antes de pedir el correo se apunta el idioma, y
 * si la página castellana recibe la sesión por el enlace en este mismo
 * navegador, devuelve a la persona a su idioma. El arreglo completo (mandar el
 * enlace directamente a /<idioma>/suscripcion) exige añadir antes
 * https://micarga.es/** a Authentication → URL Configuration.
 */
const CLAVE_RETORNO = 'micarga-idioma-retorno';
const UNA_HORA = 60 * 60 * 1000;

const apuntarIdiomaDeVuelta = () => {
  try {
    if (IDIOMA === 'es') localStorage.removeItem(CLAVE_RETORNO);
    else localStorage.setItem(CLAVE_RETORNO, JSON.stringify({ idioma: IDIOMA, cuando: Date.now() }));
  } catch { /* sin almacenamiento, vuelve en castellano como antes */ }
};

/** El idioma al que hay que devolver a quien llega por el enlace, o null. */
const idiomaDeVuelta = () => {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE_RETORNO) || 'null');
    localStorage.removeItem(CLAVE_RETORNO);
    if (!r || Date.now() - r.cuando > UNA_HORA) return null;
    return /^[a-z]{2}$/.test(r.idioma) && r.idioma !== 'es' ? r.idioma : null;
  } catch { return null; }
};

// Se mira ANTES de crear el cliente: supabase-js consume y borra el fragmento
// con la sesión en cuanto arranca.
const LLEGA_POR_ENLACE = /[#&?](access_token|code|token_hash)=/.test(location.href);

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

// Estado del recorrido: el correo con el que se está entrando.
//
// (Aquí vivía `datosAlta`, que guardaba la contraseña del alta para ponerla
// después del código. Desde que el alta se hace con signUp, que la pone de una
// vez, nadie lo rellenaba y la rama que lo usaba era código muerto: fuera,
// auditoría 02-10-2026, SEG-60.)
let correoEnCurso = '';

// Ya paga su licencia y ha pedido contratar para su empresa (COB-16). Hace
// falta recordarlo porque, al volver de rellenar la facturación, la página
// vuelve a preguntar a `enviar-enlace-pago`, que le seguirá diciendo 409.
let paraEmpresa = false;

// La empresa elegida cuando la persona pertenece a varias (COB-06). Solo se
// rellena si `crear-sesion-pago` ha pedido elegir; el servidor vuelve a
// comprobar que es una de las suyas.
let empresaElegida = null;

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
const pedirCodigo = async (email, crear, metadatos) => {
  apuntarIdiomaDeVuelta();
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: crear,
      emailRedirectTo: 'https://micarga.es/suscripcion',
      captchaToken: await vale(),
      ...(metadatos ? { data: metadatos } : {}),
    },
  });
};

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
    `Wir haben Ihnen an ${email} geschrieben. Kopieren Sie den Code hierher; wenn die ` +
    `E-Mail einen Link enthält, kommen Sie auch damit hinein. Falls Sie sie nicht sehen, schauen Sie im Spam nach.`;
  mostrarPaso('paso-codigo');
  $('codigo').focus();
};

$('form-correo').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const correo = $('correo').value.trim();
  if (!correo) return;

  await ocupado($('btn-correo'), 'Wird geprüft…', async () => {
    const { error } = await pedirCodigo(correo, false);
    correoEnCurso = correo;

    if (error) {
      if (esCuentaInexistente(error)) {
        // No hay cuenta: se crea aquí, sin mandar a nadie a la app.
        $('alta-correo').textContent = correo;
        mostrarPaso('paso-alta');
        return;
      }
      avisar('Wir konnten Ihnen den Code nicht senden. Versuchen Sie es in einer Minute erneut.');
      return;
    }

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
    avisar('Um das Konto zu erstellen, müssen Sie die Nutzungsbedingungen und die Datenschutzerklärung akzeptieren.');
    return;
  }
  // 8 y no 6 (auditoría 02-10-2026, SEG-31): con 6 caracteres y sin captcha,
  // las cuentas que pagan quedan al alcance de la fuerza bruta. El mínimo del
  // servidor se sube DESPUÉS, cuando también lo pidan las apps publicadas: si
  // se subiera antes, sus altas fallarían con un error genérico.
  if (val('password').length < 8) {
    avisar('Das Passwort muss mindestens 8 Zeichen haben.');
    return;
  }
  if (!nifValido(val('nif_cif'))) {
    avisar('Diese NIF/CIF ist ungültig. Prüfen Sie, ob der Buchstabe zu den Ziffern passt.');
    f.elements['nif_cif'].dataset.mal = 'si';
    return;
  }
  delete f.elements['nif_cif'].dataset.mal;

  const telefono = normalizarTelefono(val('phone'));
  if (!telefono) {
    avisar('Die Telefonnummer ist ungültig. Geben Sie eine spanische Handynummer mit 9 Ziffern ein, die mit 6 oder 7 beginnt.');
    f.elements['phone'].dataset.mal = 'si';
    return;
  }
  delete f.elements['phone'].dataset.mal;

  await ocupado($('btn-alta'), 'Wird erstellt…', async () => {
    // Los mismos metadatos que manda la app: el trigger handle_new_user los
    // convierte en la fila de `profiles`. Si esta lista se queda corta, el
    // usuario acaba con un perfil a medias.
    const metadatos = {
      first_name: val('first_name'),
      last_name: val('last_name'),
      nif_cif: val('nif_cif').toUpperCase(),
      company_name: val('company_name'),
      phone: telefono,
      // El idioma de la página, como lo manda la app (App.tsx). Sin él,
      // handle_new_user pone «es» y la bienvenida y los avisos salen en
      // castellano a quien se ha dado de alta en /de/ o /pl/ (auditoría
      // 02-10-2026, REL-15 y SOL-13).
      idioma: IDIOMA,
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
    apuntarIdiomaDeVuelta();
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
        ? 'Wir konnten das Konto nicht erstellen. Wahrscheinlich ist diese Telefonnummer schon mit einer anderen E-Mail-Adresse registriert. Versuchen Sie eine andere Nummer oder schreiben Sie uns an soporte@micarga.es.'
        : 'Wir konnten das Konto nicht erstellen. Versuchen Sie es in einer Minute erneut.');
      return;
    }

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

  await ocupado($('btn-contrasena'), 'Anmeldung…', async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: correoEnCurso, password,
      // Entrar con contraseña no manda ningún correo, pero Turnstile en
      // Supabase se activa para TODO Auth, no por formulario: si este envío
      // fuera sin vale, dejaría de funcionar el día que se ponga la clave.
      options: { captchaToken: await vale() },
    });
    if (error) {
      avisar('Dieses Passwort ist nicht korrekt. Versuchen Sie es erneut oder verwenden Sie den Code, den wir Ihnen per E-Mail geschickt haben.');
      return;
    }
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
    avisar('Kopieren Sie den ganzen Code, genau wie er in der E-Mail steht.');
    return;
  }

  await ocupado($('btn-codigo'), 'Wird geprüft…', async () => {
    const { error } = await supabase.auth.verifyOtp({
      email: correoEnCurso, token, type: 'email',
    });
    if (error) {
      avisar('Der Code ist falsch oder abgelaufen. Fordern Sie einen neuen an.');
      return;
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
  // La lista se monta APARTE y no dentro de la plantilla: con las comillas de
  // `join(', ')` dentro, el generador de idiomas no reconocía la frase y salía
  // en castellano en los ocho (auditoría 02-10-2026, DUP-04).
  const lista = nombres.join(', ');
  avisar(nombres.length > 0
    ? `Um Ihnen die Rechnung ausstellen zu können, fehlt noch: ${lista}.`
    : 'Prüfen Sie die Rechnungsdaten: Irgendetwas stimmt nicht.', 'info');
};

$('form-facturacion').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();

  // getSession y no getUser: getUser pregunta al servidor en cada llamada, y
  // aquí solo hace falta el id; lo que protege los datos es RLS (auditoría
  // 02-10-2026, REN-52).
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    avisar('Die Sitzung wurde beendet. Melden Sie sich mit Ihrer E-Mail-Adresse erneut an.');
    mostrarPaso('paso-correo');
    return;
  }

  const form = $('form-facturacion');
  const fila = { user_id: user.id };
  for (const campo of CAMPOS_FACTURACION) {
    fila[campo] = (form.elements[campo].value || '').trim();
  }
  if (!nifValido(fila.nif)) {
    avisar('Diese NIF/CIF ist ungültig. Prüfen Sie, ob der Buchstabe zu den Ziffern passt.');
    form.elements['nif'].dataset.mal = 'si';
    return;
  }
  delete form.elements['nif'].dataset.mal;

  const emailFactura = (form.elements['email_facturacion'].value || '').trim();
  // Vacío se guarda como null y no como cadena vacía: la columna es opcional y
  // una cadena vacía haría creer que hay un correo de facturación puesto.
  fila.email_facturacion = emailFactura === '' ? null : emailFactura;

  await ocupado($('btn-facturacion'), 'Wird gespeichert…', async () => {
    const { error } = await supabase
      .from('datos_facturacion')
      .upsert(fila, { onConflict: 'user_id' });
    if (error) {
      avisar('Wir konnten Ihre Daten nicht speichern. Versuchen Sie es erneut.');
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
const prepararYaSuscrito = async ({ ofrecerEmpresa = false } = {}) => {
  // Contratar para la empresa solo tiene sentido si quien ya paga es la
  // PERSONA; si la «ya suscrita» es la empresa, no hay nada más que contratar.
  $('bloque-contratar-empresa').hidden = !ofrecerEmpresa;
  let clienteStripe = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
      // Ya paga su licencia. Si ha pedido contratar para su empresa, se sigue
      // por ahí (COB-16); si no, esto es el final del recorrido: se le dice
      // que está todo bien, el portal si tiene sentido y la opción de empresa.
      if (paraEmpresa) {
        await irAPlanesDeEmpresa();
        return;
      }
      await prepararYaSuscrito({ ofrecerEmpresa: true });
      mostrarPaso('paso-ya-suscrito');
      return;
    }

    if (status === 412) {
      const cuerpo = await cuerpoDe(error);
      const { data: { session } } = await supabase.auth.getSession();
      mostrarPaso('paso-facturacion');
      if (session?.user) await precargarFacturacion(session.user.id);
      marcarProblemas(cuerpo?.problemas);
      return;
    }

    if (status === 401) {
      avisar('Die Sitzung wurde beendet. Melden Sie sich mit Ihrer E-Mail-Adresse erneut an.');
      mostrarPaso('paso-correo');
      return;
    }

    avisar('Wir können den Abschluss gerade nicht durchführen. Schreiben Sie uns an soporte@micarga.es oder per WhatsApp an +34 744 716 449, und wir aktivieren es für Sie.');
    mostrarPaso('paso-correo');
    return;
  }

  if (!enlaceUsable(data?.enlaceMensual) || !enlaceUsable(data?.enlaceAnual)) {
    avisar('Wir können den Abschluss gerade nicht durchführen. Schreiben Sie uns an soporte@micarga.es, und wir aktivieren es für Sie.');
    mostrarPaso('paso-correo');
    return;
  }

  // Los enlaces fijos ya no se usan para contratar —solo saben vender UNA
  // licencia— pero se siguen pidiendo porque es esta llamada la que dice si
  // la persona ya paga (409) o le faltan datos fiscales (412). Lo que se
  // pinta viene de `crear-sesion-pago`.
  $('nota-empresa').hidden = !paraEmpresa;
  prepararCantidad();
  mostrarPaso('paso-planes');
};

/**
 * Quien ya paga su licencia pasa a contratar para su empresa (COB-16).
 *
 * `enviar-enlace-pago` no sirve de puerta aquí: responde 409 por el estado de
 * la persona antes de mirar sus datos fiscales. Así que la ficha se comprueba
 * en esta página con la misma regla, y lo que decide si la EMPRESA puede
 * contratar lo dice después `crear-sesion-pago`, que es quien cobra.
 */
const irAPlanesDeEmpresa = async () => {
  paraEmpresa = true;
  limpiarAviso();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    avisar('Die Sitzung wurde beendet. Melden Sie sich mit Ihrer E-Mail-Adresse erneut an.');
    mostrarPaso('paso-correo');
    return;
  }
  const { data: fac, error } = await supabase
    .from('datos_facturacion')
    .select(CAMPOS_FACTURACION.join(', '))
    .eq('user_id', user.id)
    .maybeSingle();
  // Un fallo al leer no bloquea: la última palabra la tiene el servidor, y
  // `crear-sesion-pago` puede contestar 412 igual que la puerta.
  const problemas = error ? [] : problemasFacturacion(fac);
  if (problemas.length > 0) {
    mostrarPaso('paso-facturacion');
    await precargarFacturacion(user.id);
    marcarProblemas(problemas);
    return;
  }
  $('nota-empresa').hidden = false;
  prepararCantidad();
  mostrarPaso('paso-planes');
};

$('btn-contratar-empresa')?.addEventListener('click', () => irAPlanesDeEmpresa());

/**
 * Pinta la lista de empresas entre las que elegir (COB-06).
 *
 * Los nombres los escriben los clientes: van con `textContent`, nunca como
 * HTML. Pulsar una sigue con el pago que ya se había pedido.
 */
const pedirEmpresa = (organizaciones, periodo, boton) => {
  const lista = $('lista-empresas');
  lista.replaceChildren();
  for (const o of organizaciones) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sus-btn-plano';
    b.textContent = o.nombre;
    b.addEventListener('click', () => {
      empresaElegida = { id: o.id, nombre: o.nombre };
      $('bloque-elegir-empresa').hidden = true;
      $('empresa-elegida-nombre').textContent = o.nombre;
      $('empresa-elegida').hidden = false;
      contratar(periodo, boton);
    });
    lista.appendChild(b);
  }
  $('empresa-elegida').hidden = true;
  $('bloque-elegir-empresa').hidden = false;
  $('bloque-elegir-empresa').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

/** Lo que manda el servidor cuando hay que elegir, comprobado antes de pintarlo. */
const empresasCandidatas = (cuerpo) => {
  if (cuerpo?.codigo !== 'elegir-organizacion' || !Array.isArray(cuerpo.organizaciones)) return null;
  const validas = cuerpo.organizaciones.filter(
    (o) => o && typeof o.id === 'string' && o.id !== '' && typeof o.nombre === 'string',
  );
  return validas.length > 0 ? validas : null;
};

$('btn-cambiar-empresa')?.addEventListener('click', () => {
  empresaElegida = null;
  $('empresa-elegida').hidden = true;
  limpiarAviso();
});

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

/** Cuántas licencias se están pidiendo.
 *
 *  🚨 El suelo es CERO y no uno desde el 27-09-2026: una oficina puede
 *  contratar solo el CRM. Lo que no se admite es cero licencias sin CRM, y eso
 *  se comprueba al pulsar el plan —y otra vez en el servidor—, no aquí. */
const leerCantidad = () => {
  const campo = $('sus-conductores');
  let n = parseInt(campo.value, 10);
  if (!Number.isInteger(n) || n < 0) n = 0;
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

  // 🚨 Cero licencias y sin CRM es un carrito vacío: los botones de plan se
  // apagan en vez de mandar al servidor una petición que va a rechazar. El
  // servidor la rechaza igual —nunca se fía de la pantalla—, pero aquí se le
  // dice a la persona lo que le falta antes de que pulse.
  const vacio = n === 0 && !crm;
  for (const boton of document.querySelectorAll('.sus-plan')) boton.disabled = vacio;
  const aviso = document.querySelector('[data-carrito-vacio]');
  if (aviso) aviso.hidden = !vacio;
};

/**
 * Deja la pantalla con lo que ya contestó en la calculadora de la portada.
 *
 * Los valores llegan por la interrogación de la URL y se validan igual que si
 * viniesen de un desconocido: acaban en un cobro recurrente. `licencias` solo
 * se acepta como un entero de 0 a 100 (0 = solo el CRM; sin CRM, 0 deja
 * el botón de pagar apagado).
 */
const prepararCantidad = () => {
  const params = new URLSearchParams(location.search);
  const pedidas = params.get('licencias');
  if (/^\d{1,3}$/.test(pedidas || '')) {
    const n = Number(pedidas);
    if (n >= 0 && n <= MAXIMO_LICENCIAS) $('sus-conductores').value = String(n);
  }
  if (params.get('crm') === '1') $('sus-crm').checked = true;
  pintarPrecios();
};

/** Pide la sesión de pago y manda a Stripe. */
const contratar = async (periodo, boton) => {
  limpiarAviso();
  boton.disabled = true;

  const { data, error } = await supabase.functions.invoke('crear-sesion-pago', {
    body: {
      periodo,
      licencias: leerCantidad(),
      crm: $('sus-crm').checked,
      // Solo si el servidor pidió elegir (COB-06). Él vuelve a comprobar que
      // la persona puede contratar para esa empresa.
      ...(empresaElegida ? { organizacion_id: empresaElegida.id } : {}),
    },
  });

  if (error) {
    boton.disabled = false;
    const status = estadoDe(error);
    const cuerpo = await cuerpoDe(error);

    if (status === 409 && cuerpo?.codigo === 'ya-suscrita') {
      // La que ya está suscrita es la EMPRESA: no se le ofrece contratar otra
      // vez para ella, solo el portal para cambiar licencias.
      await prepararYaSuscrito({ ofrecerEmpresa: false });
      mostrarPaso('paso-ya-suscrito');
      if (cuerpo?.error) avisar(cuerpo.error, 'info');
      return;
    }
    // Pertenece a varias empresas: que elija (COB-06).
    const candidatas = (status === 409 || status === 422) ? empresasCandidatas(cuerpo) : null;
    if (candidatas) {
      empresaElegida = null;
      pedirEmpresa(candidatas, periodo, boton);
      return;
    }
    // Faltan datos fiscales: hoy lo dice `enviar-enlace-pago`, pero la puerta
    // de verdad debe ser la función que cobra (COB-30). Se atiende igual.
    if (status === 412) {
      const { data: { session } } = await supabase.auth.getSession();
      mostrarPaso('paso-facturacion');
      if (session?.user) await precargarFacturacion(session.user.id);
      marcarProblemas(cuerpo?.problemas);
      return;
    }
    if (status === 401) {
      avisar('Die Sitzung wurde beendet. Melden Sie sich mit Ihrer E-Mail-Adresse erneut an.');
      mostrarPaso('paso-correo');
      return;
    }
    // El resto —demasiadas licencias, varias empresas, precios mal
    // configurados— trae un mensaje pensado para leerse, así que se enseña
    // tal cual en vez de taparlo con uno genérico.
    avisar(cuerpo?.error || 'Wir können den Abschluss gerade nicht durchführen. Schreiben Sie uns an soporte@micarga.es oder per WhatsApp an +34 744 716 449, und wir aktivieren es für Sie.');
    return;
  }

  if (!enlaceUsable(data?.url)) {
    boton.disabled = false;
    avisar('Wir können den Abschluss gerade nicht durchführen. Schreiben Sie uns an soporte@micarga.es, und wir aktivieren es für Sie.');
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
    cantidad.value = String(Math.min(MAXIMO_LICENCIAS, Math.max(0, leerCantidad() + paso)));
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
  //
  // 🚨 Y SE BORRA DE LA BARRA EN CUANTO SE LEE (auditoría 02-10-2026, SEG-08).
  // Con el correo en la dirección, Google Analytics lo recibía como parte de
  // `page_location`: un dato personal directo enviado a un tercero, justo lo
  // que prohíben sus condiciones. Esto corre antes que consentimiento.js
  // (módulo antes que `defer`, en el orden del HTML), que además lo filtra por
  // su cuenta.
  //
  // Se acepta también `#correo=…`: el fragmento no viaja al servidor ni a los
  // registros de nadie, y es como lo mandarán la app y el bot en cuanto se
  // publiquen sus versiones nuevas. Hasta entonces llega por los dos sitios.
  try {
    const url = new URL(location.href);
    const enElFragmento = /^#correo=/.test(url.hash)
      ? decodeURIComponent(url.hash.slice('#correo='.length))
      : null;
    const correoEnLaUrl = enElFragmento || url.searchParams.get('correo');
    if (correoEnLaUrl) $('correo').value = correoEnLaUrl.trim();
    if (url.searchParams.has('correo') || enElFragmento !== null) {
      url.searchParams.delete('correo');
      // Solo se toca un fragmento que sea el del correo: el del enlace de
      // acceso de Supabase (`#access_token=…`) lo consume supabase-js.
      if (enElFragmento !== null) url.hash = '';
      history.replaceState(history.state, '', url.toString());
    }
  } catch {
    // Dirección rara: se ignora y se pide el correo como siempre.
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session && LLEGA_POR_ENLACE && IDIOMA === 'es') {
    const vuelta = idiomaDeVuelta();
    if (vuelta) {
      // La sesión ya está guardada en este origen: la página del idioma la
      // encuentra y sigue desde ahí.
      location.replace(`/${vuelta}/suscripcion`);
      return;
    }
  }
  if (session) await pedirEnlaces();
})();
