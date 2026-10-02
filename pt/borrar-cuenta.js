// Borrado de cuenta desde la web.
//
// POR QUÉ EXISTE, ADEMÁS DE LA OPCIÓN DENTRO DE LA APP
// Google Play exige DOS cosas a las apps que dejan crear cuenta: poder borrarla
// desde dentro de la app, y una URL pública donde pedir el borrado sin tener la
// app instalada. Esta página es la segunda. Apple lo exige en la guideline
// 5.1.1(v). Y por RGPD, el derecho de supresión no puede depender de que
// conserves un móvil concreto.
//
// Se optó por que la página BORRE de verdad, en vez de ser un formulario que
// manda un correo a soporte: quien ya desinstaló la app puede terminar aquí sin
// esperar a que alguien le conteste, y no queda una bandeja de solicitudes
// pendientes que atender a mano dentro del plazo de 30 días.
//
// Quien decide es la Edge Function `borrar-cuenta`, la misma que usa la app:
// aquí no se replica ninguna regla. Desde el 17-09-2026 una suscripción viva YA
// NO impide borrar —lo prohíbe la guideline 5.1.1(v) de Apple—: el servidor la
// cancela él en Stripe antes de borrar. Lo único que rechaza es que el correo
// escrito no coincida. (Antes rechazaba con suscripción viva porque borrar el
// perfil no cancelaba nada en Stripe: seguiría cobrando sin que el cliente
// tenga dónde entrar a pararlo.)

// supabase-js servido desde la propia web, no desde esm.sh (auditoría
// 02-10-2026, SEG-07 y SEG-53): ver la cabecera de vendor/.
import { createClient } from '/vendor/supabase-js-2.39.8.js';
// La dirección y la clave, del único sitio donde están escritas (REL-18).
import { SUPABASE_URL, SUPABASE_KEY } from '/config.js?v=20261002a';
// Con ?v= como cualquier otro script (auditoría 02-10-2026, INV-10 y REN-13):
// sin él, un arreglo de turnstile.js dependía SOLO de la caché corta de
// _headers. Al cambiar turnstile.js, subir este número.
import { montarTurnstile } from './turnstile.js?v=20261002b';


// La vuelta al idioma cuando se entra por el enlace del correo: la misma
// solución que suscripcion.js (auditoría 02-10-2026, REL-22). El enlace lleva
// siempre a /borrar-cuenta en castellano, la única dirección permitida hoy.
const IDIOMA = (document.documentElement.lang || 'es').slice(0, 2);
const CLAVE_RETORNO = 'micarga-idioma-retorno-borrado';
const LLEGA_POR_ENLACE = /[#&?](access_token|code|token_hash)=/.test(location.href);

const apuntarIdiomaDeVuelta = () => {
  try {
    if (IDIOMA === 'es') localStorage.removeItem(CLAVE_RETORNO);
    else localStorage.setItem(CLAVE_RETORNO, JSON.stringify({ idioma: IDIOMA, cuando: Date.now() }));
  } catch { /* vuelve en castellano, como antes */ }
};

const idiomaDeVuelta = () => {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE_RETORNO) || 'null');
    localStorage.removeItem(CLAVE_RETORNO);
    if (!r || Date.now() - r.cuando > 60 * 60 * 1000) return null;
    return /^[a-z]{2}$/.test(r.idioma) && r.idioma !== 'es' ? r.idioma : null;
  } catch { return null; }
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Ver turnstile.js: sin clave configurada esto no pinta nada y `vale()`
// devuelve `undefined`, que es como iba hasta ahora.
let vale = async () => undefined;
(() => {
  const escudo = document.getElementById('turnstile');
  // Visible antes de pintarlo: dentro de un `display:none` no se dibuja bien.
  escudo.hidden = false;
  montarTurnstile(escudo).then((f) => {
    if (!f) { escudo.hidden = true; return; }
    vale = f;
    escudo.dataset.montado = 'si';
    mostrarPaso(pasoActual);
  });
})();
const $ = (id) => document.getElementById(id);

const PASOS = ['paso-correo', 'paso-codigo', 'paso-confirmar', 'paso-hecho'];
let pasoActual = PASOS[0];

const mostrarPaso = (id) => {
  for (const p of PASOS) $(p).hidden = p !== id;
  pasoActual = id;
  // El widget está fuera de los pasos: se esconde cuando ya no hace falta.
  const escudo = $('turnstile');
  if (escudo?.dataset.montado === 'si') escudo.hidden = (id === 'paso-hecho');
};

const avisar = (texto, tono = 'error') => {
  const el = $('aviso');
  el.textContent = texto;
  el.dataset.tono = tono;
  el.hidden = false;
};
const limpiarAviso = () => { $('aviso').hidden = true; };

const ocupado = async (boton, textoMientras, tarea) => {
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoMientras;
  try { return await tarea(); }
  finally { boton.disabled = false; boton.textContent = original; }
};

/**
 * El motivo real de un error de la función.
 *
 * Se lee del CUERPO de la respuesta, no del mensaje: @supabase/functions-js
 * manda siempre el mismo texto fijo pase lo que pase. Leer el mensaje es lo que
 * dejó muerta la rama del 429 en el pago (hallazgo APP-429).
 */
const motivoDelError = async (error) => {
  try {
    const cuerpo = await error?.context?.json?.();
    if (cuerpo?.error) return cuerpo.error;
  } catch { /* nos quedamos con el genérico */ }
  return 'Não conseguimos apagar a conta. Escreve-nos para soporte@micarga.es e fazemo-lo nós.';
};

let correoEnCurso = '';

// --- Paso 1: el correo -----------------------------------------------------

$('form-correo').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const correo = $('correo').value.trim();
  if (!correo) return;

  await ocupado($('btn-correo'), 'A enviar…', async () => {
    // shouldCreateUser: false — sería absurdo crear una cuenta para borrarla, y
    // peor: cualquiera podría comprobar correos ajenos creando cuentas sueltas.
    apuntarIdiomaDeVuelta();
    const { error } = await supabase.auth.signInWithOtp({
      email: correo,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://micarga.es/borrar-cuenta',
        captchaToken: await vale(),
      },
    });
    // 🚨 «No existe» y «enviado» se contestan IGUAL (auditoría 02-10-2026,
    // SEG-24 y REL-23). Decir «no hay ninguna cuenta con ese correo» convertía
    // esta página en un buscador de clientes de Mi Carga para quien quisiera
    // preparar un fraude dirigido. No cierra del todo la puerta —la API de
    // Auth también lo delata; eso lo cierra el captcha (SEG-01)—, pero deja
    // de ofrecerla en bandeja.
    const noExiste = error && (
      error.code === 'otp_disabled' || error.error_code === 'otp_disabled' || error.status === 422
      || /signups? not allowed|user not found/i.test(error.message || '')
    );
    if (error && !noExiste) {
      avisar('Não conseguimos enviar-te o código. Tenta de novo dentro de um minuto.');
      return;
    }
    correoEnCurso = correo;
    $('ayuda-codigo').textContent =
      `Se houver uma conta Mi Carga com ${correo}, escrevemos-te. Copia aqui o código; se o ` +
      `correio trouxer uma ligação, tocar nela também serve. Se não o vires, procura no spam.`;
    mostrarPaso('paso-codigo');
    $('codigo').focus();
  });
});

$('btn-otro-correo').addEventListener('click', () => {
  limpiarAviso();
  $('codigo').value = '';
  mostrarPaso('paso-correo');
  $('correo').focus();
});

// --- Paso 2: el código -----------------------------------------------------

$('form-codigo').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const token = $('codigo').value.replace(/\D/g, '');
  // Supabase manda códigos de 6 a 10 dígitos (hoy 8): el mismo arreglo que
  // suscripcion.js del 07-09-2026. Quien decide si vale es verifyOtp().
  if (token.length < 6 || token.length > 10) { avisar('Copia o código inteiro, tal como vem no correio.'); return; }

  await ocupado($('btn-codigo'), 'A verificar…', async () => {
    const { error } = await supabase.auth.verifyOtp({ email: correoEnCurso, token, type: 'email' });
    if (error) { avisar('O código não está correto ou expirou. Pede um novo e verifica se o correio é o da tua conta.'); return; }
    $('correo-confirmado').textContent = correoEnCurso;
    mostrarPaso('paso-confirmar');
    $('confirmacion').focus();
  });
});

// --- Paso 3: confirmar y borrar -------------------------------------------

// El botón no se habilita hasta que el correo escrito coincide. Se perdonan
// mayúsculas y espacios porque el teclado del móvil pone mayúscula automática;
// cualquier otra cosa, no. Es irreversible: conviene algo entre el impulso y el
// botón.
$('confirmacion').addEventListener('input', () => {
  const escrito = $('confirmacion').value.trim().toLowerCase();
  $('btn-borrar').disabled = escrito === '' || escrito !== correoEnCurso.trim().toLowerCase();
});

$('btn-cancelar').addEventListener('click', async () => {
  limpiarAviso();
  await supabase.auth.signOut();
  $('confirmacion').value = '';
  $('btn-borrar').disabled = true;
  mostrarPaso('paso-correo');
});

$('form-confirmar').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();

  await ocupado($('btn-borrar'), 'A apagar…', async () => {
    const { error } = await supabase.functions.invoke('borrar-cuenta', {
      body: { confirmacion: $('confirmacion').value },
    });
    if (error) {
      avisar(await motivoDelError(error));
      return;
    }
    // La cuenta ya no existe: la sesión que queda en este navegador es un
    // cascarón. Se cierra para no dejar un token de un usuario borrado.
    await supabase.auth.signOut();
    mostrarPaso('paso-hecho');
  });
});

// --- Arranque: quien entra por el ENLACE del correo ------------------------
//
// El correo trae un código y también un enlace. Quien pulsaba el enlace
// llegaba aquí con la sesión ya abierta… y la página le volvía a pedir el
// correo desde el principio. Ahora va directo a confirmar, y si pidió el
// código desde otro idioma, vuelve a su idioma (auditoría 02-10-2026,
// REL-22). La marca de `sessionStorage` es la que lleva ese «viene del
// enlace» a la página del idioma, que ya no tiene el fragmento en la URL.
(async () => {
  const MARCA_ENLACE = 'micarga-borrado-por-enlace';
  let porEnlace = LLEGA_POR_ENLACE;
  try {
    if (sessionStorage.getItem(MARCA_ENLACE)) { porEnlace = true; sessionStorage.removeItem(MARCA_ENLACE); }
  } catch { /* sin almacenamiento: solo cuenta el fragmento */ }
  if (!porEnlace) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.email) return;

  if (IDIOMA === 'es') {
    const vuelta = idiomaDeVuelta();
    if (vuelta) {
      try { sessionStorage.setItem(MARCA_ENLACE, '1'); } catch { /* ídem */ }
      location.replace(`/${vuelta}/borrar-cuenta`);
      return;
    }
  }
  correoEnCurso = session.user.email;
  $('correo-confirmado').textContent = correoEnCurso;
  mostrarPaso('paso-confirmar');
  $('confirmacion').focus();
})();
