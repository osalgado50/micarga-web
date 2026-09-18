// El panel de cookies y la carga de Google Analytics detrás de él.
//
// POR QUÉ ESTE FICHERO EXISTE Y NO UN SIMPLE `<script async src=gtag>`
// La política de cookies publicada en micarga.es/cookies dice, con estas
// palabras: «Si en el futuro se incorporan cookies analíticas o publicitarias,
// esta página se actualizará con el detalle de cada cookie y se mostrará un
// panel de consentimiento ANTES de instalarlas». Pegar el script de Analytics
// sin panel no es solo el artículo 22.2 de la LSSI: es incumplir lo que la
// propia web promete por escrito, que es lo primero que mira una inspección.
//
// LA DECISIÓN QUE HAY QUE ENTENDER ANTES DE TOCAR NADA
// Aquí NO se carga nada de Google hasta que alguien dice que sí. Ni siquiera
// `gtag.js` con el consentimiento en «denied».
//
// Google recomienda lo contrario —cargar gtag con todo denegado y usar el
// «modo de consentimiento v2»—, porque así modela las conversiones de quien
// rechaza y Ads da mejores números. Pero eso significa cargar un script de un
// tercero y enviarle una petición con la IP del visitante ANTES de que haya
// consentido. La AEPD no lo ve claro, y el coste de equivocarse aquí —una
// sanción— es mucho mayor que el de tener datos algo peores en Ads.
//
// Se envían las señales del modo de consentimiento igualmente, pero DESPUÉS
// de aceptar, junto con la carga. Quien acepta cuenta con todo; quien rechaza
// no existe para Google. Es una pérdida real de datos y es a propósito.
//
// ⚠️ Para que esto sirva de algo hace falta el identificador de medición de
// GA4. Mientras `MEDICION` esté vacío no se enseña el panel siquiera: un
// banner de cookies que pide permiso para no instalar ninguna cookie es
// ridículo, y molestaría a los visitantes a cambio de nada.

/** El identificador de GA4, «G-XXXXXXXXXX». Vacío = todo esto está apagado. */
const MEDICION = 'G-9G0GZCR1W7';

/** Dónde se guarda lo que ha elegido. Un año, que es lo que recomienda la AEPD. */
const CLAVE = 'micarga-cookies';
const MESES_VALIDO = 12;

const idioma = () => (document.documentElement.lang || 'es').slice(0, 2);

// Los textos, aquí y no en el HTML, porque el panel lo escribe JavaScript y el
// generador de /ca y /en solo traduce lo que está en el HTML.
const T = {
  es: {
    titulo: 'Cookies',
    texto: 'Usamos cookies propias necesarias para que la web funcione y, si nos dejas, cookies de Google para saber qué páginas se visitan y medir nuestros anuncios. Sin tu permiso no se instala ninguna.',
    politica: 'Ver la política de cookies',
    aceptar: 'Aceptar todas',
    rechazar: 'Rechazar todas',
    configurar: 'Elegir',
    guardar: 'Guardar mi elección',
    analitica: 'Analítica',
    analiticaAyuda: 'Qué páginas se visitan y desde dónde. Nos dice qué mejorar.',
    publicidad: 'Publicidad',
    publicidadAyuda: 'Medir si nuestros anuncios sirven de algo. Sin esto pagamos a ciegas.',
    necesarias: 'Necesarias',
    necesariasAyuda: 'Idioma y el funcionamiento básico. No se pueden desactivar.',
    siempre: 'Siempre',
  },
  ca: {
    titulo: 'Galetes',
    texto: 'Fem servir galetes pròpies necessàries perquè el web funcioni i, si ens ho permets, galetes de Google per saber quines pàgines es visiten i mesurar els nostres anuncis. Sense el teu permís no se n’instal·la cap.',
    politica: 'Veure la política de galetes',
    aceptar: 'Acceptar-les totes',
    rechazar: 'Rebutjar-les totes',
    configurar: 'Triar',
    guardar: 'Desar la meva elecció',
    analitica: 'Analítica',
    analiticaAyuda: 'Quines pàgines es visiten i des d’on. Ens diu què millorar.',
    publicidad: 'Publicitat',
    publicidadAyuda: 'Mesurar si els nostres anuncis serveixen d’alguna cosa.',
    necesarias: 'Necessàries',
    necesariasAyuda: 'Idioma i el funcionament bàsic. No es poden desactivar.',
    siempre: 'Sempre',
  },
  en: {
    titulo: 'Cookies',
    texto: 'We use our own cookies to make the site work and, if you let us, Google cookies to see which pages get visited and to measure our ads. None are installed without your permission.',
    politica: 'Read the cookie policy',
    aceptar: 'Accept all',
    rechazar: 'Reject all',
    configurar: 'Choose',
    guardar: 'Save my choice',
    analitica: 'Analytics',
    analiticaAyuda: 'Which pages get visited and from where. It tells us what to improve.',
    publicidad: 'Advertising',
    publicidadAyuda: 'Measuring whether our ads do anything. Without it we pay blind.',
    necesarias: 'Necessary',
    necesariasAyuda: 'Language and basic operation. These cannot be turned off.',
    siempre: 'Always',
  },
};

const t = () => T[idioma()] || T.es;

// La política de cookies está en la raíz del idioma; el blog cuelga de un
// subdirectorio, así que un enlace relativo desde ahí apuntaría a /blog/cookies.
const enlacePolitica = () => (location.pathname.includes('/blog/') ? '/cookies' : 'cookies');

const leer = () => {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!guardado || typeof guardado.cuando !== 'number') return null;
    const meses = (Date.now() - guardado.cuando) / (1000 * 60 * 60 * 24 * 30.4);
    // Un consentimiento caducado NO vale: hay que volver a preguntar.
    return meses > MESES_VALIDO ? null : guardado;
  } catch {
    // Navegación privada o almacenamiento bloqueado. Sin sitio donde recordar
    // la respuesta, lo honesto es no dar por hecho un sí.
    return null;
  }
};

const guardar = (analitica, publicidad) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ analitica, publicidad, cuando: Date.now() }));
  } catch { /* si no se puede guardar, se volverá a preguntar. Mejor eso que asumir */ }
};

let cargado = false;

/**
 * Carga Google Analytics. Solo se llama con un sí por delante.
 *
 * Las señales del modo de consentimiento se mandan igualmente: Ads las espera,
 * y decirle a Google exactamente qué se ha consentido es mejor que no decirle
 * nada. La diferencia con lo que recomienda Google es CUÁNDO: aquí, después
 * del sí, nunca antes.
 */
const cargarAnalytics = (analitica, publicidad) => {
  if (cargado || !MEDICION || !analitica) return;
  cargado = true;

  window.dataLayer = window.dataLayer || [];
  // `arguments` a propósito, no un array: es lo que espera gtag.
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: publicidad ? 'granted' : 'denied',
    ad_user_data: publicidad ? 'granted' : 'denied',
    ad_personalization: publicidad ? 'granted' : 'denied',
  });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEDICION}`;
  document.head.appendChild(s);

  gtag('js', new Date());
  // `anonymize_ip` ya no hace falta en GA4 (siempre anonimiza), pero
  // `allow_google_signals` sí: sin publicidad consentida, fuera.
  gtag('config', MEDICION, { allow_google_signals: !!publicidad });
};

const cerrarPanel = () => {
  const el = document.getElementById('cookies-panel');
  if (el) el.remove();
};

const aplicar = (analitica, publicidad) => {
  guardar(analitica, publicidad);
  cerrarPanel();
  cargarAnalytics(analitica, publicidad);
};

const pintarPanel = () => {
  const x = t();
  const caja = document.createElement('div');
  caja.id = 'cookies-panel';
  caja.className = 'ck';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-live', 'polite');
  caja.setAttribute('aria-label', x.titulo);
  caja.innerHTML = `
    <div class="ck-caja">
      <div class="ck-texto">
        <strong>${x.titulo}</strong>
        <p>${x.texto}</p>
        <a href="${enlacePolitica()}">${x.politica}</a>
      </div>
      <div class="ck-detalle" id="ck-detalle" hidden>
        <label class="ck-fila ck-fila-fija">
          <span><strong>${x.necesarias}</strong><small>${x.necesariasAyuda}</small></span>
          <em>${x.siempre}</em>
        </label>
        <label class="ck-fila">
          <span><strong>${x.analitica}</strong><small>${x.analiticaAyuda}</small></span>
          <input type="checkbox" id="ck-analitica" checked>
        </label>
        <label class="ck-fila">
          <span><strong>${x.publicidad}</strong><small>${x.publicidadAyuda}</small></span>
          <input type="checkbox" id="ck-publicidad" checked>
        </label>
        <button type="button" class="ck-btn ck-btn-si" id="ck-guardar">${x.guardar}</button>
      </div>
      <div class="ck-botones" id="ck-botones">
        <button type="button" class="ck-btn ck-btn-si" id="ck-aceptar">${x.aceptar}</button>
        <button type="button" class="ck-btn ck-btn-no" id="ck-rechazar">${x.rechazar}</button>
        <button type="button" class="ck-btn ck-btn-mas" id="ck-configurar">${x.configurar}</button>
      </div>
    </div>`;
  document.body.appendChild(caja);

  // Aceptar y rechazar se pintan IGUAL de visibles a propósito. Un «rechazar»
  // escondido en un enlace gris es lo que la AEPD sanciona: el no tiene que
  // costar lo mismo que el sí.
  document.getElementById('ck-aceptar').addEventListener('click', () => aplicar(true, true));
  document.getElementById('ck-rechazar').addEventListener('click', () => aplicar(false, false));
  document.getElementById('ck-configurar').addEventListener('click', () => {
    document.getElementById('ck-detalle').hidden = false;
    document.getElementById('ck-botones').hidden = true;
  });
  document.getElementById('ck-guardar').addEventListener('click', () => aplicar(
    document.getElementById('ck-analitica').checked,
    document.getElementById('ck-publicidad').checked,
  ));
};

/**
 * Reabre el panel. Cuelga de `window` porque lo llama el enlace «Cookies» del
 * pie: retirar el consentimiento tiene que ser tan fácil como darlo, y eso
 * significa un sitio visible en todas las páginas, no enterrado en un texto.
 */
window.abrirPanelCookies = () => {
  cerrarPanel();
  pintarPanel();
};

const arrancar = () => {
  // El enlace del pie que reabre el panel. Se engancha SIEMPRE, aunque no haya
  // identificador de medición todavía: así el pie no enseña un enlace muerto.
  for (const el of document.querySelectorAll('[data-cookies]')) {
    el.addEventListener('click', (e) => { e.preventDefault(); window.abrirPanelCookies(); });
  }

  if (!MEDICION) return;
  const elegido = leer();
  if (elegido) cargarAnalytics(elegido.analitica, elegido.publicidad);
  else pintarPanel();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancar);
} else {
  arrancar();
}
