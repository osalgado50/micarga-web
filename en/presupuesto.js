// Petición de presupuesto para empresas.
//
// A diferencia del formulario de los 10 portes de prueba de la portada —que no
// manda nada al servidor: compone un mensaje y abre WhatsApp—, esto SÍ va al
// servidor y aterriza en el correo de soporte. Un presupuesto necesita rastro:
// hay que volver a él días después para hacer seguimiento, y un WhatsApp se
// pierde entre conversaciones.
//
// Las reglas de validación de verdad viven en el servidor
// (supabase/functions/solicitar-presupuesto/logic.ts, con tests). Aquí solo se
// comprueba lo mínimo para no hacer viajar una petición que va a volver con un
// error: quién manda es el servidor.

const FUNCION = 'https://yrwletmszkfvnpbkngek.supabase.co/functions/v1/solicitar-presupuesto';

// La clave publicable es pública por diseño: va dentro del paquete de la app y
// del bundle de app.micarga.es. La función está desplegada sin verificación de
// JWT, pero la pasarela de Supabase sigue exigiendo la cabecera `apikey`.
const SUPABASE_KEY = 'sb_publishable_sOknpnTQXY0CqOMyv-UZSw_cYjp2YzO';

const $ = (id) => document.getElementById(id);

const avisar = (texto, tono = 'error') => {
  const el = $('aviso');
  el.textContent = texto;
  el.dataset.tono = tono;
  el.hidden = false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

const limpiarAviso = () => { $('aviso').hidden = true; };

const form = $('form-presupuesto');
const boton = $('btn-enviar');

// --- Reto anti-robots ------------------------------------------------------
//
// El servidor manda una pregunta, cuatro opciones y una ficha firmada; aquí
// solo se pintan y se devuelve cuál se ha tocado. Cuál es la buena NO se sabe
// en esta página: eso solo lo sabe el servidor, que lo deduce de la ficha.
//
// Si el reto no llega —función caída, sin conexión en ese instante— el
// formulario se envía igual, sin ficha. El servidor lo rechazará solo si él sí
// tiene el reto configurado, y entonces se vuelve a pedir. Preferimos eso a
// dejar a una empresa mirando un formulario que no se deja enviar.

let ficha = null;
let respuesta = null;

const pedirReto = async () => {
  ficha = null;
  respuesta = null;
  const caja = $('reto');
  caja.hidden = true;
  delete caja.dataset.mal;

  let datos;
  try {
    const r = await fetch(FUNCION, { headers: { apikey: SUPABASE_KEY } });
    datos = await r.json();
  } catch { return; }
  if (!datos?.ficha) return;

  ficha = datos.ficha;
  $('reto-pregunta').textContent = datos.pregunta;

  const opciones = $('reto-opciones');
  opciones.textContent = '';
  datos.opciones.forEach((emoji, i) => {
    const b = document.createElement('button');
    // `type="button"`: dentro de un <form>, un <button> sin tipo es un botón
    // de envío y tocar una opción mandaría el formulario a medio rellenar.
    b.type = 'button';
    b.className = 'sus-reto-opcion';
    b.textContent = emoji;
    b.setAttribute('aria-pressed', 'false');
    // El emoji no lo lee un lector de pantalla de forma útil, así que la
    // opción se nombra por su posición, que es lo que sí se puede decir.
    b.setAttribute('aria-label', `Option ${i + 1}`);
    b.addEventListener('click', () => {
      respuesta = i;
      delete caja.dataset.mal;
      for (const otro of opciones.children) otro.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
    });
    opciones.appendChild(b);
  });

  caja.hidden = false;
};

pedirReto();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();

  const val = (n) => (form.elements[n]?.value || '').trim();
  const datos = {
    empresa: val('empresa'),
    contacto: val('contacto'),
    email: val('email'),
    telefono: val('telefono'),
    conductores: val('conductores'),
    cuentas: val('cuentas'),
    mensaje: val('mensaje'),
    web: val('web'),
    ficha,
    respuesta,
  };

  // Solo los cuatro obligatorios, y con el mismo criterio que el servidor. El
  // resto de comprobaciones no se duplican aquí: dos validaciones distintas
  // acaban discrepando y el cliente se queda sin saber cuál le está frenando.
  const faltan = ['empresa', 'contacto', 'email', 'cuentas'].filter((c) => !datos[c]);
  if (faltan.length > 0) {
    avisar('Fill in the company, your name, the email address and how many accounts you need.');
    form.elements[faltan[0]].focus();
    return;
  }

  // Si hay reto y no se ha tocado nada, se avisa aquí en vez de dejar que el
  // servidor conteste «esa no era»: no ha fallado, es que no ha contestado.
  if (ficha && respuesta === null) {
    $('reto').dataset.mal = 'si';
    avisar('The check below is missing: tap the right answer.');
    $('reto').scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Enviando…';

  try {
    const respuestaHttp = await fetch(FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify(datos),
    });

    let cuerpo = null;
    try { cuerpo = await respuestaHttp.json(); } catch { /* respuesta sin JSON */ }

    if (!respuestaHttp.ok) {
      // El mensaje del servidor es más concreto que cualquiera que pueda
      // inventarse aquí («ese correo no parece válido», «faltan datos»), así
      // que se enseña el suyo si lo hay.
      avisar(cuerpo?.error || 'We couldn\'t send your request. Try again or write to us at soporte@micarga.es.');
      // Una ficha caducada ya no sirve para nada: se pide un reto nuevo para
      // que el siguiente intento no vuelva a chocar con lo mismo. Si solo se
      // ha fallado, se deja el mismo reto y se marca en rojo — cambiárselo
      // debajo del dedo desconcierta más que ayuda.
      if (cuerpo?.reto === 'caducada' || cuerpo?.reto === 'firma' || cuerpo?.reto === 'formato') {
        await pedirReto();
      } else if (cuerpo?.reto === 'fallada') {
        $('reto').dataset.mal = 'si';
      }
      return;
    }

    $('paso-formulario').hidden = true;
    $('paso-enviado').hidden = false;
    limpiarAviso();
  } catch {
    // Sin conexión, o la función caída.
    avisar('We couldn\'t connect. Check your connection, or write to us at soporte@micarga.es and we\'ll sort it out anyway.');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});
