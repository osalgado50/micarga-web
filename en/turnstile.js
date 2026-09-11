// Turnstile: el escudo de los formularios que mandan correo a través de
// Supabase Auth (el código de acceso de /suscripcion y el de /borrar-cuenta).
//
// POR QUÉ AQUÍ NO VALE NUESTRO RETO DE EMOJI
// El del presupuesto llama a una función nuestra, y ahí podemos exigir lo que
// queramos antes de mandar nada. Estos dos no: quien manda el correo es
// Supabase Auth, y su endpoint está abierto en internet. Un robot que lo llame
// directamente ni pasa por esta página ni ve reto ninguno — el correo saldría
// igual, a la dirección que él diga. La única barrera que sirve es la que
// comprueba el propio Supabase, y esa es Turnstile: se activa en
// Authentication → Attack Protection y a partir de ahí Auth rechaza toda
// petición que no traiga un `captchaToken` válido.
//
// Turnstile no enseña semáforos ni letras deformadas: mira cómo se comporta el
// navegador y en la inmensa mayoría de los casos no pide nada. Quien rellena el
// formulario ve una casilla que se marca sola.
//
// ⚠️ SIN CLAVE, NO SE ACTIVA. Mientras `CLAVE_SITIO` esté vacía esto no pinta
// nada y los formularios funcionan como hasta ahora. Turnstile solo cuenta
// cuando está puesto EN LOS DOS SITIOS: la clave pública aquí y la privada en
// Supabase. Si se pusiera solo en Supabase, ninguna alta funcionaría.

/**
 * Clave pública del sitio (Cloudflare → Turnstile). Es pública por diseño: va
 * en el HTML de la página. La privada NO se escribe aquí ni en ningún archivo
 * del repositorio — esa va solo en Supabase.
 */
export const CLAVE_SITIO = '';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let cargando = null;

const cargarScript = () => {
  if (cargando) return cargando;
  cargando = new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = resolver;
    s.onerror = () => rechazar(new Error('Turnstile could not be loaded.'));
    document.head.appendChild(s);
  });
  return cargando;
};

/**
 * Pinta el widget dentro de `contenedor` y devuelve una función para conseguir
 * el vale de un envío.
 *
 * Cada vale sirve UNA VEZ y caduca a los pocos minutos, así que no se guarda
 * uno y se reutiliza: se pide fresco en cada envío y después se resetea el
 * widget. Si se reutilizara, el segundo intento fallaría con un error que no
 * dice nada útil («captcha protection: request disallowed») y quien está
 * delante no tendría forma de saber que basta con volver a intentarlo.
 *
 * El contenedor tiene que estar VISIBLE al llamar: Turnstile se dibuja sobre
 * él, y un `display:none` en ese momento le deja el reto interactivo a medias.
 * Quien llama decide cuándo se ve; aquí solo se pinta.
 *
 * Devuelve `null` si no hay clave configurada: entonces `vale()` devuelve
 * `undefined` y las llamadas a Supabase van sin `captchaToken`, que es
 * exactamente como iban antes.
 */
export const montarTurnstile = async (contenedor) => {
  if (!CLAVE_SITIO || !contenedor) return null;

  try {
    await cargarScript();
  } catch {
    // Cloudflare inalcanzable: mejor un formulario sin escudo que un
    // formulario que no se deja enviar.
    return null;
  }

  // `turnstile.ready()` NO se usa: existe solo mientras el script se está
  // cargando y desaparece después, así que llamarlo cuando el `onload` ya ha
  // saltado revienta con «ready is not a function». Se espera a que aparezca
  // `render`, que es lo único que hace falta, con un tope: si en tres segundos
  // no está, el script se ha cargado a medias o alguien lo está bloqueando.
  for (let i = 0; typeof window.turnstile?.render !== 'function' && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (typeof window.turnstile?.render !== 'function') {
    console.warn('Turnstile never loaded; the form is running without it.');
    return null;
  }

  let pendiente = null;
  let resolverVale = null;

  const id = window.turnstile.render(contenedor, {
    sitekey: CLAVE_SITIO,
    // El tema lo decide la página, que es oscura siempre.
    theme: 'dark',
    language: 'es',
    callback: (vale) => { resolverVale?.(vale); resolverVale = null; },
    'error-callback': () => { resolverVale?.(undefined); resolverVale = null; },
    // Un vale caducado en pantalla no sirve: se pide otro sin molestar a nadie.
    'expired-callback': () => window.turnstile.reset(id),
  });

  return async () => {
    // Lo normal es que Turnstile ya haya resuelto solo mientras se rellenaba el
    // formulario. Si no —porque ha decidido preguntar algo— se espera a que la
    // persona termine, con un tope para no dejar el botón girando para siempre.
    const ya = window.turnstile.getResponse(id);
    if (ya) { window.turnstile.reset(id); return ya; }

    pendiente ??= new Promise((r) => { resolverVale = r; });
    const vale = await Promise.race([
      pendiente,
      new Promise((r) => setTimeout(() => r(undefined), 30000)),
    ]);
    pendiente = null;
    window.turnstile.reset(id);
    return vale;
  };
};
