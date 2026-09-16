// El formulario de contacto de micarga.es.
//
// POR QUÉ ESTA PÁGINA EXISTE
// La web enseñaba `soporte@micarga.es` en 146 enlaces `mailto:`. Dos problemas.
// El primero: una dirección publicada en el HTML de un sitio indexado es de
// donde la sacan los recolectores de correo basura. El segundo, y peor: un
// `mailto:` solo hace algo si quien lo pulsa tiene un cliente de correo
// configurado. En un móvil sin la app de correo abierta, al tocarlo NO PASA
// NADA, y esa persona se va pensando que no hay forma de contactar.
//
// Aquí el mensaje llega siempre, y llega con el teléfono, que es lo que hacía
// falta para poder devolver la llamada.
//
// Las reglas de validación de verdad viven en el servidor
// (supabase/functions/contacto/logic.ts, con 18 pruebas). Aquí solo se
// comprueba lo mínimo para no hacer viajar una petición que va a volver con un
// error: quién manda es el servidor.

const FUNCION = 'https://yrwletmszkfvnpbkngek.supabase.co/functions/v1/contacto';

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

const form = $('form-contacto');
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
// dejar a alguien mirando un formulario que no se deja enviar.

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
    b.setAttribute('aria-label', `Opción ${i + 1}`);
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

// El botón del consejero de seguridad ADR de la portada llega con
// `?motivo=Consejero+de+seguridad+ADR`. Se preselecciona si coincide con una de
// las opciones; si no coincide, se añade. Así quien viene de un sitio concreto
// no tiene que volver a decir de qué venía.
const motivoPedido = new URLSearchParams(location.search).get('motivo');
if (motivoPedido) {
  const select = form.elements.motivo;
  const existe = [...select.options].some((o) => o.value === motivoPedido);
  if (!existe) select.add(new Option(motivoPedido, motivoPedido));
  select.value = motivoPedido;
}

pedirReto();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAviso();

  const val = (n) => (form.elements[n]?.value || '').trim();
  const datos = {
    nombre: val('nombre'),
    email: val('email'),
    telefono: val('telefono'),
    motivo: val('motivo'),
    mensaje: val('mensaje'),
    web: val('web'),
    ficha,
    respuesta,
  };

  // Solo los cuatro obligatorios, y con el mismo criterio que el servidor. El
  // resto de comprobaciones no se duplican aquí: dos validaciones distintas
  // acaban discrepando y quien escribe se queda sin saber cuál le está frenando.
  const faltan = ['nombre', 'email', 'telefono', 'mensaje'].filter((c) => !datos[c]);
  if (faltan.length > 0) {
    avisar('Rellena tu nombre, el correo, el teléfono y el mensaje.');
    form.elements[faltan[0]].focus();
    return;
  }

  // Si hay reto y no se ha tocado nada, se avisa aquí en vez de dejar que el
  // servidor conteste «esa no era»: no ha fallado, es que no ha contestado.
  if (ficha && respuesta === null) {
    $('reto').dataset.mal = 'si';
    avisar('Falta la comprobación de abajo: toca la respuesta correcta.');
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
      avisar(cuerpo?.error || 'No hemos podido enviar tu mensaje. Inténtalo otra vez en un minuto.');
      // Una ficha caducada ya no sirve para nada: se pide un reto nuevo para
      // que el siguiente intento no vuelva a chocar con lo mismo. Si solo se
      // ha fallado, se deja el mismo reto y se marca en rojo — cambiárselo
      // debajo del dedo desconcierta más que ayuda.
      if (cuerpo?.reto === 'caducada' || cuerpo?.reto === 'gastada' || cuerpo?.reto === 'firma' || cuerpo?.reto === 'formato') {
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
    avisar('No hemos podido conectar. Comprueba la conexión y vuelve a intentarlo, o escríbenos por WhatsApp al +34 744 716 449.');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});
