// CargIA, el asistente IA de Mi Carga: el botón flotante y la ventana del chat.
//
// El chat NO está aquí: es una página del servidor de CargIA
// (https://asistente.micarga.es/asistente?p=web) que se abre en un iframe. Así
// se actualiza sin tocar la web y la misma ventana sirve para el CRM y la app.
//
// · El iframe se crea al pulsar el botón, no al cargar la página: quien no lo
//   usa no hace ninguna petición al servidor de CargIA.
// · Solo en castellano (CargIA responde en castellano): en las páginas de otros
//   idiomas este script no hace nada. Por eso puede ir en index.html aunque
//   i18n.py lo copie a los nueve idiomas, y sus textos no se traducen.
// · El micrófono del chat necesita `microphone=(self "https://asistente.micarga.es")`
//   en Permissions-Policy (_headers) y allow="microphone" en el iframe.
// · El chat avisa de que se cierra con postMessage({cargia: 'cerrar'}).
(() => {
  if (!(document.documentElement.lang || '').startsWith('es')) return;
  const yo = document.currentScript;
  const ORIGEN = (yo && yo.dataset.origen) || 'https://asistente.micarga.es';
  const PLATAFORMA = (yo && yo.dataset.plataforma) || 'web';

  const css = document.createElement('style');
  css.textContent = `
    .cargia-boton { position: fixed; right: 30px; bottom: 30px; z-index: 1000; display: flex; align-items: center; gap: 10px;
      height: 56px; padding: 0 20px 0 8px; border: 1px solid rgba(249,115,22,.55); border-radius: 999px; cursor: pointer;
      background: #111827; color: #fff; font: 700 .98rem/1 'Outfit', system-ui, sans-serif; box-shadow: 0 10px 28px rgba(0,0,0,.45);
      transition: transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s; }
    .cargia-boton:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(249,115,22,.35); }
    .cargia-boton .cargia-cara { position: relative; width: 40px; height: 40px; border-radius: 50%; background: #0b0f19; display: grid; place-items: center; }
    .cargia-boton .cargia-cara img { width: 26px; height: auto; }
    .cargia-boton .cargia-cara::after { content: ""; position: absolute; right: 1px; bottom: 1px; width: 9px; height: 9px; border-radius: 50%; background: #25d366; box-shadow: 0 0 0 2px #111827; }
    .cargia-boton b { color: #f97316; }
    .cargia-ventana { position: fixed; right: 24px; bottom: 24px; z-index: 1001; width: 400px; height: min(640px, calc(100vh - 48px));
      border: 1px solid rgba(255,255,255,.14); border-radius: 18px; overflow: hidden; background: #0b0f19; box-shadow: 0 24px 60px rgba(0,0,0,.6);
      opacity: 0; transform: translateY(16px) scale(.98); pointer-events: none; transition: opacity .2s, transform .25s cubic-bezier(.16,1,.3,1); }
    .cargia-ventana.abierta { opacity: 1; transform: none; pointer-events: auto; }
    .cargia-ventana iframe { width: 100%; height: 100%; border: 0; display: block; }
    @media (max-width: 768px) {
      .cargia-boton { right: 20px; bottom: 20px; height: 50px; padding: 0 16px 0 6px; font-size: .92rem; }
      .cargia-boton .cargia-cara { width: 38px; height: 38px; }
    }
    @media (max-width: 600px) {
      .cargia-ventana { inset: 0; width: auto; height: auto; border-radius: 0; border: 0; }
    }
    @media (prefers-reduced-motion: reduce) { .cargia-boton, .cargia-ventana { transition: none; } }`;
  document.head.appendChild(css);

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'cargia-boton';
  boton.setAttribute('aria-label', 'Preguntar a CargIA, el asistente de Mi Carga');
  boton.innerHTML = '<span class="cargia-cara"><img src="/images/camion-tema-oscuro.png" alt="" width="26" height="18"></span><span>Pregunta a Carg<b>IA</b></span>';

  let ventana = null;
  const abrir = () => {
    if (!ventana) {
      ventana = document.createElement('div');
      ventana.className = 'cargia-ventana';
      ventana.setAttribute('role', 'dialog');
      ventana.setAttribute('aria-label', 'CargIA, asistente de Mi Carga');
      const marco = document.createElement('iframe');
      marco.src = `${ORIGEN}/asistente?p=${encodeURIComponent(PLATAFORMA)}`;
      marco.title = 'CargIA, asistente de Mi Carga';
      marco.allow = 'microphone';
      ventana.appendChild(marco);
      document.body.appendChild(ventana);
      void ventana.offsetWidth;   // para que se vea la transición la primera vez
    }
    ventana.classList.add('abierta');
    boton.hidden = true;
  };
  const cerrar = () => {
    if (ventana) ventana.classList.remove('abierta');
    boton.hidden = false;
    boton.focus();
  };
  boton.addEventListener('click', abrir);
  window.addEventListener('message', (e) => {
    if (e.origin === ORIGEN && e.data && e.data.cargia === 'cerrar') cerrar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ventana && ventana.classList.contains('abierta')) cerrar();
  });

  document.body.appendChild(boton);
})();
