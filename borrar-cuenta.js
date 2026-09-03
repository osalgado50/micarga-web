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
// aquí no se replica ninguna regla. Rechaza si hay suscripción viva (borrar el
// perfil no cancela nada en Stripe: seguiría cobrando sin que el cliente tenga
// dónde entrar a pararlo) y exige que el correo escrito coincida.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

// Clave publicable: es pública por diseño, va ya en el paquete de la app. Lo
// que protege los datos es RLS, no esconderla.
const SUPABASE_URL = 'https://yrwletmszkfvnpbkngek.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sOknpnTQXY0CqOMyv-UZSw_cYjp2YzO';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

const PASOS = ['paso-correo', 'paso-codigo', 'paso-confirmar', 'paso-hecho'];
const mostrarPaso = (id) => { for (const p of PASOS) $(p).hidden = p !== id; };

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
  return 'No hemos podido borrar la cuenta. Escríbenos a soporte@micarga.es y lo hacemos nosotros.';
};

let correoEnCurso = '';

// --- Paso 1: el correo -----------------------------------------------------

$('form-correo').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const correo = $('correo').value.trim();
  if (!correo) return;

  await ocupado($('btn-correo'), 'Enviando…', async () => {
    // shouldCreateUser: false — sería absurdo crear una cuenta para borrarla, y
    // peor: cualquiera podría comprobar correos ajenos creando cuentas sueltas.
    const { error } = await supabase.auth.signInWithOtp({
      email: correo,
      options: { shouldCreateUser: false, emailRedirectTo: 'https://micarga.es/borrar-cuenta' },
    });
    if (error) {
      const noExiste = /signups? not allowed|user not found/i.test(error.message || '');
      avisar(noExiste
        ? 'No hay ninguna cuenta de Mi Carga con ese correo. Comprueba que es el que usabas, o escríbenos a soporte@micarga.es.'
        : 'No hemos podido enviarte el código. Inténtalo de nuevo en un minuto.');
      return;
    }
    correoEnCurso = correo;
    $('ayuda-codigo').textContent =
      `Te hemos escrito a ${correo}. Copia aquí el código de 6 dígitos; si el ` +
      `correo trae un enlace, pulsándolo también sirve. Si no lo ves, mira en spam.`;
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
  if (token.length !== 6) { avisar('El código son 6 dígitos.'); return; }

  await ocupado($('btn-codigo'), 'Comprobando…', async () => {
    const { error } = await supabase.auth.verifyOtp({ email: correoEnCurso, token, type: 'email' });
    if (error) { avisar('El código no es correcto o ha caducado. Pide uno nuevo.'); return; }
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

  await ocupado($('btn-borrar'), 'Borrando…', async () => {
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
