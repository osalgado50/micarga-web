// Activación de la suscripción desde la web.
//
// POR QUÉ EXISTE ESTA PÁGINA
// La app no puede llevar enlaces de compra: Apple (guideline 3.1.3(f)) y Google
// exigirían su compra integrada, con comisión del 15-30%. Mi Carga se publica
// bajo la excepción de «servicio multiplataforma»: se paga en la web y se entra
// en la app con la suscripción ya contratada. Esta página es ese «en la web».
//
// LA TRAMPA QUE RESUELVE
// Una web estática no sabe quién es el visitante. Un botón que fuera a Stripe a
// pelo produciría un pago sin `client_reference_id`, y el webhook no podría
// casarlo con ninguna cuenta: el cliente paga y se queda bloqueado igual. Por
// eso aquí se entra primero con la cuenta que ya existe en la app, y los
// enlaces se los pide al servidor ya personalizados.
//
// DÓNDE VIVEN LAS REGLAS
// No aquí. En la Edge Function `enviar-enlace-pago`, que es código de servidor
// —ni app ni web—, y que ya tiene sus pruebas. Esta página se limita a
// preguntar y obedecer lo que responda:
//
//   200 → enlaces personalizados listos, se pintan los dos planes
//   409 → ya tiene suscripción vigente. NO se le ofrece contratar otra: cada
//         enlace de Stripe crea una suscripción NUEVA, así que acabaría pagando
//         10 € y 90 € a la vez y la primera quedaría huérfana facturando para
//         siempre. Se le manda al portal de cliente.
//   412 → le faltan datos fiscales. Sin ellos se cobrarían 10 € con IVA español
//         sin poder emitir una factura válida. Se piden aquí mismo.
//
// Duplicar esos tres criterios en JavaScript sería una tercera copia de algo ya
// duplicado dos veces (navegador y Deno), y sería la que se desincronizara.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

// La clave publicable es pública por diseño: va ya dentro del paquete de la app
// y del bundle de app.micarga.es. Lo que protege los datos es RLS, no ocultarla.
const SUPABASE_URL = 'https://yrwletmszkfvnpbkngek.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sOknpnTQXY0CqOMyv-UZSw_cYjp2YzO';

// Portal de cliente de Stripe, en MODO REAL (activado el 27-08-2026). Es donde
// se manda a quien ya tiene suscripción: cambiar de plan, actualizar la tarjeta,
// cancelar o descargar facturas. Nunca un enlace de pago, que crearía una
// suscripción NUEVA y cobraría dos.
//
// Se distingue de la de pruebas en que NO lleva el segmento «/test_» después de
// «/p/login/». Aquí estuvo la de pruebas hasta el 27-08-2026.
//
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

const PASOS = ['paso-correo', 'paso-codigo', 'paso-facturacion', 'paso-planes', 'paso-ya-suscrito'];

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

// ---------------------------------------------------------------------------
// Paso 1 y 2: entrar con la cuenta que ya existe
// ---------------------------------------------------------------------------

let correoEnCurso = '';

$('form-correo').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const correo = $('correo').value.trim();
  if (!correo) return;

  await ocupado($('btn-correo'), 'Enviando…', async () => {
    // shouldCreateUser: false — esta página NO crea cuentas. El alta pasa por
    // la app, que es la que crea el perfil y acepta los términos. Si aquí se
    // creara una cuenta suelta, el usuario pagaría y su cuenta no tendría
    // perfil con el que casar la suscripción.
    //
    // emailRedirectTo: el correo de Supabase puede traer un CÓDIGO de 6 dígitos,
    // un ENLACE, o los dos, según la plantilla del panel: el código solo existe
    // si la plantilla incluye `{{ .Token }}`. Como no se puede dar por hecho, se
    // cubren las dos vías: aquí se dice adónde tiene que volver el enlace, y
    // supabase-js recoge la sesión solo al aterrizar (detectSessionInUrl).
    // ⚠️ Esta URL tiene que estar en la lista de redirecciones permitidas de
    // Supabase (Authentication → URL Configuration). Si no lo está, el enlace
    // del correo lleva a un error y solo funciona el código.
    const { error } = await supabase.auth.signInWithOtp({
      email: correo,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://micarga.es/suscripcion',
      },
    });

    if (error) {
      // Se dice claramente que no hay cuenta, en vez de un mensaje neutro. Sí,
      // permite comprobar si un correo está registrado, pero eso ya se puede
      // hacer desde la pantalla de acceso de la app, así que aquí no se añade
      // ninguna vía nueva; y un «si tienes cuenta te llegará el código» deja
      // esperando un código que no va a llegar a quien de verdad no la tiene.
      const noExiste = /signups? not allowed|user not found/i.test(error.message || '');
      avisar(noExiste
        ? 'No encontramos ninguna cuenta con ese correo. Créala gratis en la app (app.micarga.es) y vuelve aquí: los 10 portes de prueba no se pierden.'
        : 'No hemos podido enviar el código. Inténtalo de nuevo en un minuto.');
      return;
    }

    correoEnCurso = correo;
    $('ayuda-codigo').textContent =
      `Te hemos escrito a ${correo}. Copia aquí el código de 6 dígitos; si el ` +
      `correo trae un enlace, pulsándolo también entras. Si no lo ves, mira en spam.`;
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

$('form-codigo').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();
  const token = $('codigo').value.replace(/\D/g, '');
  if (token.length !== 6) {
    avisar('El código son 6 dígitos.');
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
    await pedirEnlaces();
  });
});

// ---------------------------------------------------------------------------
// Paso 3: datos de facturación
// ---------------------------------------------------------------------------

/** Rellena el formulario con lo que ya haya guardado, para no pedirlo dos veces. */
const precargarFacturacion = async (userId) => {
  const { data } = await supabase
    .from('datos_facturacion')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return;
  const form = $('form-facturacion');
  for (const campo of [...CAMPOS_FACTURACION, 'email_facturacion']) {
    if (form.elements[campo] && typeof data[campo] === 'string') {
      form.elements[campo].value = data[campo];
    }
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
    if (control) control.dataset.mal = 'si';
    if (ROTULOS[p.campo]) nombres.push(ROTULOS[p.campo]);
  }
  if (nombres.length > 0) {
    avisar(`Para poder emitirte la factura falta ${nombres.join(', ')}.`, 'info');
  }
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

const pedirEnlaces = async () => {
  limpiarAviso();

  const { data, error } = await supabase.functions.invoke('enviar-enlace-pago', {
    body: { modo: 'url' },
  });

  if (error) {
    const status = estadoDe(error);

    if (status === 409) {
      $('btn-portal').href = PORTAL_CLIENTE;
      mostrarPaso('paso-ya-suscrito');
      return;
    }

    if (status === 412) {
      const cuerpo = await cuerpoDe(error);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await precargarFacturacion(user.id);
      mostrarPaso('paso-facturacion');
      marcarProblemas(cuerpo?.problemas);
      return;
    }

    if (status === 401) {
      avisar('Se ha cerrado la sesión. Vuelve a entrar con tu correo.');
      mostrarPaso('paso-correo');
      return;
    }

    // 500 es el caso real de hoy: el cobro todavía no está configurado en
    // Stripe. Se dice sin tecnicismos y se ofrece la vía humana.
    avisar('Ahora mismo no podemos completar la contratación. Escríbenos a soporte@micarga.es o por WhatsApp al +34 640 216 351 y lo activamos nosotros.');
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
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await pedirEnlaces();
})();
