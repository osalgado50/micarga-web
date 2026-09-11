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
  };

  // Solo los cuatro obligatorios, y con el mismo criterio que el servidor. El
  // resto de comprobaciones no se duplican aquí: dos validaciones distintas
  // acaban discrepando y el cliente se queda sin saber cuál le está frenando.
  const faltan = ['empresa', 'contacto', 'email', 'cuentas'].filter((c) => !datos[c]);
  if (faltan.length > 0) {
    avisar('Rellena la empresa, tu nombre, el correo y cuántas cuentas necesitáis.');
    form.elements[faltan[0]].focus();
    return;
  }

  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Enviando…';

  try {
    const respuesta = await fetch(FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify(datos),
    });

    let cuerpo = null;
    try { cuerpo = await respuesta.json(); } catch { /* respuesta sin JSON */ }

    if (!respuesta.ok) {
      // El mensaje del servidor es más concreto que cualquiera que pueda
      // inventarse aquí («ese correo no parece válido», «faltan datos»), así
      // que se enseña el suyo si lo hay.
      avisar(cuerpo?.error || 'No hemos podido enviar tu petición. Inténtalo de nuevo o escríbenos a soporte@micarga.es.');
      return;
    }

    $('paso-formulario').hidden = true;
    $('paso-enviado').hidden = false;
    limpiarAviso();
  } catch {
    // Sin conexión, o la función caída.
    avisar('No hemos podido conectar. Comprueba la conexión, o escríbenos a soporte@micarga.es y te lo preparamos igual.');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});
