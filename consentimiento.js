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

/**
 * El identificador de Google Ads, «AW-XXXXXXXXX». Vacío = no se mide ningún
 * anuncio.
 *
 * ⚠️ VA DETRÁS DE LA CASILLA DE PUBLICIDAD, NO DE LA DE ANALÍTICA. Son dos
 * permisos distintos en el panel y la política de cookies los describe por
 * separado. Quien acepta saber qué páginas se visitan pero no quiere que le
 * midamos los anuncios tiene derecho a esa combinación, y aquí se respeta:
 * sin `publicidad`, este identificador no se configura y la conversión no se
 * envía.
 */
const ANUNCIOS = 'AW-18461463262';

/**
 * El contenedor de Google Tag Manager, «GTM-XXXXXXX». Vacío = no se carga.
 *
 * 🚨 VA AQUÍ Y NO PEGADO EN EL HTML, aunque Google diga que se pegue en el
 * `<head>` de todas las páginas. Pegado ahí se descarga `gtm.js` en cuanto
 * abres la web: una petición a un servidor de Google con la IP del visitante
 * ANTES de que haya dicho que sí. Eso es exactamente lo que este fichero entero
 * existe para no hacer, y lo que micarga.es/cookies promete por escrito. Desde
 * aquí se carga igual, en todas las páginas —este fichero está en las 208—,
 * pero después del consentimiento.
 *
 * ⚠️ Y OJO CON LO QUE METAS DENTRO DEL CONTENEDOR. Aquí ya se cargan GA4 y
 * Google Ads directamente (arriba). Si en Tag Manager pones otra etiqueta de
 * GA4 con el mismo identificador, cada visita se cuenta DOS veces: las sesiones
 * se disparan, el porcentaje de rebote se hunde y las conversiones se duplican.
 * El contenedor es para lo que no está ya aquí.
 *
 * ⚠️ El `<noscript>` con el iframe que Google da para pegar detrás de `<body>`
 * NO se pone, a propósito: un iframe no se puede esperar a nada, se carga solo.
 * Y solo actúa con JavaScript desactivado, que es justo cuando el panel de
 * cookies tampoco funciona — o sea, cargaría siempre sin consentimiento. Se
 * pierde la medición de esos visitantes, que no llegan al 1 % y que de todas
 * formas no se podrían medir legalmente.
 */
const CONTENEDOR = 'GTM-TM53WWCG';

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

// ---------------------------------------------------------------------------
// Lo que NO puede llegar a Google desde la dirección de la página
// ---------------------------------------------------------------------------
//
// 🚨 GA4 manda como `page_location` la dirección entera, y las etiquetas de Tag
// Manager leen `location` por su cuenta. En esta web hay dos cosas que viajan
// en la dirección y que Google no debe ver nunca (auditoría 02-10-2026, SEG-08
// y REL-05):
//
//   · el CORREO del cliente: la app y el bot de WhatsApp mandan a /suscripcion
//     con `?correo=…` (y desde ahora con `#correo=…`). Es un dato personal
//     directo, y las condiciones de GA prohíben enviarlo;
//   · las CREDENCIALES de Supabase: el enlace del correo de acceso aterriza en
//     /suscripcion y /borrar-cuenta con `#access_token=…&refresh_token=…`. Con
//     eso cualquiera entra en la cuenta.
//
// suscripcion.js borra el correo de la barra en cuanto lo lee, y supabase-js
// consume y borra el fragmento con la sesión. Pero de un orden de ejecución no
// se fía uno: aquí se comprueba igualmente. La misma guarda que la app
// (descargo-app/src/lib/medicion.ts, `hayCredencialesEnLaUrl`).

/** Parámetros que se quitan SIEMPRE de lo que se le cuenta a Google. */
const PARAMETROS_PRIVADOS = [
  'correo', 'email', 'access_token', 'refresh_token', 'provider_token',
  'code', 'token', 'token_hash', 'session_id',
];

/** ¿La dirección lleva una sesión o un correo dentro? */
const hayDatosPrivadosEnLaUrl = (href) =>
  /[#&?](access_token|refresh_token|provider_token|code|token_hash|correo|email)=/.test(href);

/**
 * La dirección que sí se le puede dar a Google: sin fragmento (nunca lleva
 * nada que medir y es donde viajan las sesiones) y sin los parámetros privados.
 */
const direccionParaMedir = () => {
  try {
    const u = new URL(location.href);
    u.hash = '';
    for (const p of PARAMETROS_PRIVADOS) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return `${location.origin}${location.pathname}`;
  }
};

/**
 * Espera a que la dirección esté limpia antes de cargar nada de Google.
 *
 * Lo normal es que lo esté ya, o que lo esté en unos cientos de milisegundos
 * (lo que tarda supabase-js en consumir el enlace). Si a los diez segundos
 * sigue sucia, en esta visita NO se mide: se pierde una página vista, que es
 * muchísimo mejor que regalarle a Google una sesión que funciona. Las
 * etiquetas de Tag Manager leen la dirección por su cuenta y a ellas no se les
 * puede pasar una versión limpia.
 */
const cuandoLaUrlEsteLimpia = async () => {
  for (let i = 0; i < 40 && hayDatosPrivadosEnLaUrl(location.href); i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  return !hayDatosPrivadosEnLaUrl(location.href);
};

/**
 * Carga Google Analytics. Solo se llama con un sí por delante.
 *
 * Las señales del modo de consentimiento se mandan igualmente: Ads las espera,
 * y decirle a Google exactamente qué se ha consentido es mejor que no decirle
 * nada. La diferencia con lo que recomienda Google es CUÁNDO: aquí, después
 * del sí, nunca antes.
 */
const cargarAnalytics = async (analitica, publicidad) => {
  if (cargado || !MEDICION || !analitica) return;
  // Se marca ANTES de esperar: dos llamadas seguidas (arranque y panel) no
  // deben acabar cargando dos veces.
  cargado = true;
  if (!(await cuandoLaUrlEsteLimpia())) {
    cargado = false;
    return;
  }

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
  // `page_location` explícito: sin él GA4 toma `location.href` entero.
  gtag('config', MEDICION, {
    allow_google_signals: !!publicidad,
    page_location: direccionParaMedir(),
  });

  // Google Ads solo si ha aceptado publicidad. Un `config` de AW- ya empieza a
  // poner cookies de conversión, así que no basta con no mandar el evento
  // después: es esta línea la que no se debe ejecutar.
  if (ANUNCIOS && publicidad) gtag('config', ANUNCIOS, { page_location: direccionParaMedir() });

  // Tag Manager, al final y con el consentimiento ya puesto en `dataLayer`.
  //
  // 🚨 EL ORDEN IMPORTA Y NO ES CAPRICHO: las señales de consentimiento se han
  // empujado arriba, a este mismo `dataLayer`, ANTES de que exista el
  // contenedor. Las etiquetas que se disparen dentro de Tag Manager se
  // encuentran el consentimiento ya declarado y lo respetan. Cargándolo antes,
  // una etiqueta de Ads podría dispararse sin saber que la publicidad está
  // rechazada.
  if (CONTENEDOR) {
    // Igual que el fragmento oficial: primero el aviso en la cola, después el
    // script. Así el contenedor sabe cuándo empezó a contar.
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    const g = document.createElement('script');
    g.async = true;
    g.src = `https://www.googletagmanager.com/gtm.js?id=${CONTENEDOR}`;
    document.head.appendChild(g);
  }
};

/**
 * ¿Se puede medir una conversión de Ads ahora mismo?
 *
 * Lo pregunta la página de gracias antes de enviar nada. Se expone aquí y no
 * se deduce allí para que la respuesta salga del mismo sitio que toma la
 * decisión de cargar: si mañana cambia la regla, cambia en un solo fichero.
 */
window.micargaPuedeMedirAnuncios = () => {
  if (!ANUNCIOS || !cargado || !window.gtag) return false;
  const e = leer();
  return !!(e && e.publicidad);
};

const cerrarPanel = () => {
  const el = document.getElementById('cookies-panel');
  if (el) el.remove();
};

/**
 * Borra las cookies de Google de este sitio.
 *
 * Se prueban las dos formas en que pueden estar puestas —con el dominio con
 * punto delante, que es como las pone gtag, y sin dominio—, porque una cookie
 * solo se borra repitiendo exactamente el dominio y la ruta con que se creó.
 */
const borrarCookies = (prefijos) => {
  const nombres = document.cookie.split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => prefijos.some((p) => n === p || n.startsWith(p)));
  const dominio = location.hostname.replace(/^www\./, '');
  for (const n of nombres) {
    for (const d of ['', `; domain=.${dominio}`, `; domain=${dominio}`]) {
      document.cookie = `${n}=; Max-Age=0; path=/${d}`;
    }
  }
};

const COOKIES_ANALITICA = ['_ga', '_gid', '_gat'];
const COOKIES_PUBLICIDAD = ['_gcl', '_gac'];

/**
 * Retirar el consentimiento tiene que surtir efecto YA, no en la próxima
 * visita (auditoría 02-10-2026, SEG-32). Con GA y Tag Manager cargados en la
 * página, guardar el «no» no los para: seguirían midiendo hasta cerrar la
 * pestaña. Así que se le dice a Google que todo queda denegado, se borran sus
 * cookies y se recarga la página, que es la única forma de descargar de verdad
 * los scripts que ya están en marcha.
 */
const retirar = (analitica, publicidad) => {
  try {
    window.gtag?.('consent', 'update', {
      analytics_storage: analitica ? 'granted' : 'denied',
      ad_storage: publicidad ? 'granted' : 'denied',
      ad_user_data: publicidad ? 'granted' : 'denied',
      ad_personalization: publicidad ? 'granted' : 'denied',
    });
  } catch { /* sin gtag no hay nada que avisar */ }
  if (!analitica) borrarCookies([...COOKIES_ANALITICA, ...COOKIES_PUBLICIDAD]);
  else if (!publicidad) borrarCookies(COOKIES_PUBLICIDAD);
  location.reload();
};

const aplicar = (analitica, publicidad) => {
  const antes = leer();
  guardar(analitica, publicidad);
  cerrarPanel();
  // ¿Se está quitando algo que ya estaba dado? Entonces no basta con no cargar.
  const quitaAnalitica = !analitica && (cargado || antes?.analitica);
  const quitaPublicidad = !publicidad && antes?.publicidad;
  if (quitaAnalitica || quitaPublicidad) {
    retirar(analitica, publicidad);
    return;
  }
  // Las cookies que pudieran quedar de una visita anterior, aunque esta vez no
  // se haya cargado nada: un «no» no puede dejar un `_ga` vivo.
  if (!analitica) borrarCookies([...COOKIES_ANALITICA, ...COOKIES_PUBLICIDAD]);
  else if (!publicidad) borrarCookies(COOKIES_PUBLICIDAD);
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

// ---------------------------------------------------------------------------
// Restos de cuando micarga.es servía la app
// ---------------------------------------------------------------------------
//
// Del 09-07 al 12-07-2026 este dominio sirvió la app (AI_COLLABORATOR.md de
// descargo-app). Los navegadores de entonces pueden conservar aquí sus datos:
// borradores, firmas y documentos en las claves `decargo_*` y la base local
// `decargo-local` (src/lib/localDb.ts). La web no los usa para nada y son datos
// de transporte y firmas de personas (auditoría 02-10-2026, REL-26).
//
// Se borran UNA vez por navegador. La sesión de Supabase (`sb-…`) no se toca:
// la usa /suscripcion, y si es vieja, Supabase la renueva o la descarta solo.
(() => {
  const HECHO = 'micarga-restos-app-borrados';
  try {
    if (localStorage.getItem(HECHO)) return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('decargo_')) localStorage.removeItem(k);
    }
    if (window.indexedDB && typeof indexedDB.deleteDatabase === 'function') {
      indexedDB.deleteDatabase('decargo-local');
    }
    localStorage.setItem(HECHO, '1');
  } catch { /* almacenamiento bloqueado: no hay nada que limpiar */ }
})();
