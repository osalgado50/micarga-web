// Página de vuelta de Stripe, después de pagar.
//
// POR QUÉ EXISTE
// Hasta el 07-09-2026 no había ninguna: el cliente pagaba y aterrizaba en la
// pantalla genérica de Stripe, sin que nadie le dijera que su cuenta ya era
// premium ni que tenía que entrar en la app. Es el momento de más duda de todo
// el proceso —acaba de dar su tarjeta— y era justo donde no se le decía nada.
//
// QUÉ HACE, Y QUÉ NO
// No se limita a dar las gracias: COMPRUEBA en la base de datos que la
// suscripción consta activa antes de afirmarlo. Entre que Stripe cobra y su
// webhook llega a nuestro servidor pasan unos segundos, y decir «ya eres
// premium» antes de tiempo es lo que hace que alguien abra la app, la vea
// bloqueada y crea que le hemos cobrado sin darle nada.
//
// Se puede comprobar porque esta página está en el MISMO origen que
// micarga.es/suscripcion, así que la sesión que abrió allí sigue disponible.
// Si no la hay —pagó en otro navegador, o borró los datos del sitio— se le
// dice lo que sabemos con certeza (el pago está hecho) y nada más.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const SUPABASE_URL = 'https://yrwletmszkfvnpbkngek.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sOknpnTQXY0CqOMyv-UZSw_cYjp2YzO';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

const PASOS = ['paso-comprobando', 'paso-activa', 'paso-tarda', 'paso-sin-sesion'];

const mostrarPaso = (id) => {
  for (const p of PASOS) $(p).hidden = p !== id;
};

/**
 * Cambia el título y la marca de la cabecera.
 *
 * La marca es puramente visual (`aria-hidden` en el HTML): lo que un lector de
 * pantalla anuncia es el título y el aviso, que son texto de verdad.
 */
const ponerCabecera = (estado, titulo) => {
  $('marca').dataset.estado = estado;
  $('titulo').textContent = titulo;
};

/**
 * Los estados que significan «esta cuenta puede emitir».
 *
 * Copia fiel de esSuscripcionVigente() de la app (src/lib/subscription.ts).
 * `past_due` cuenta como vigente allí y aquí por el mismo motivo, pero en esta
 * página no llegará nunca: se acaba de cobrar.
 */
const VIGENTES = ['active', 'trialing', 'past_due'];

/**
 * Cada cuánto y durante cuánto se pregunta.
 *
 * Doce intentos cada 2,5 segundos son 30 segundos. Es de sobra para un webhook
 * de Stripe, que suele llegar en menos de cinco, y lo bastante corto para no
 * dejar a nadie mirando una rueda. Si se agota NO se dice que haya fallado:
 * se dice que tarda, porque el cobro está hecho igualmente.
 */
const INTENTOS = 12;
const ESPERA_MS = 2500;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * La etiqueta de la acción de conversión de Google Ads.
 *
 * ⚠️ EN GOOGLE ADS ESTA ACCIÓN SE LLAMA «Registro», Y MIDE UNA VENTA.
 * El nombre viene de cómo se creó la acción en la cuenta y no se corresponde
 * con lo que cuenta: aquí solo se dispara cuando la suscripción consta ACTIVA
 * en la base de datos, o sea cuando alguien ha pagado. Decisión del
 * propietario, 25-09-2026, preguntado expresamente.
 *
 * Quien mire el panel de Ads y vea «Registro» va a pensar que cuenta altas de
 * cuenta. No lo hace: las altas ocurren en la app, no en la web, y no están
 * instrumentadas. Si algún día se quieren medir de verdad, hace falta una
 * acción de conversión NUEVA — no reutilizar ésta, o los dos números quedan
 * mezclados y ninguno sirve.
 */
const CONVERSION_ADS = 'AW-18461463262/Po2QCI_i-YAdEN6ljuNE';

/** Precios reales, IVA incluido, los mismos que cobra Stripe. */
const PRECIO_MENSUAL = 12.10;
const PRECIO_ANUAL = 108.90;

/**
 * Cuánto vale esta conversión.
 *
 * 🚨 ANTES SE MANDABA 9,99 € FIJOS, QUE NO ES NINGUNO DE NUESTROS PRECIOS.
 * Con un valor inventado, Google optimiza las pujas contra un número que no
 * existe y trata igual a quien paga 12,10 € que a quien paga 108,90 €: es
 * pagar por anuncios a ciegas, que es justo lo contrario de para lo que se
 * mide una conversión.
 *
 * El plan no se guarda en `profiles`, así que se deduce de cuándo vence: si
 * queda más de un trimestre por delante solo puede ser el anual. Es una
 * inferencia, no un dato, y por eso no se usa para nada que no sea esto.
 */
const valorDeLaConversion = (venceEn) => {
  if (!venceEn) return PRECIO_MENSUAL;
  const dias = (new Date(venceEn) - Date.now()) / (1000 * 60 * 60 * 24);
  return dias > 100 ? PRECIO_ANUAL : PRECIO_MENSUAL;
};

const estaVigente = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_expires_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  if (!VIGENTES.includes(data?.subscription_status)) return null;
  return { venceEn: data?.subscription_expires_at ?? null };
};

/**
 * Avisa a Google de que esto ha sido una venta.
 *
 * ⚠️ Se envía cuando la suscripción consta ACTIVA en la base de datos, no al
 * cargar la página. Google propone dispararlo nada más abrirse, pero aquí
 * llega gente cuyo cobro todavía no ha confirmado el webhook, y contar esas
 * visitas como conversiones ensucia la cuenta de Ads con ventas que a veces
 * no lo son.
 *
 * ⚠️ Y solo si la persona aceptó las cookies de publicidad. Lo decide
 * `consentimiento.js`, que es quien carga —o no— el identificador de Ads.
 */
const medirLaVenta = (userId, venceEn) => {
  const valor = valorDeLaConversion(venceEn);
  try {
    window.gtag?.('event', 'purchase', {
      transaction_id: userId,
      value: valor,
      currency: 'EUR',
    });
    if (window.micargaPuedeMedirAnuncios?.()) {
      window.gtag('event', 'conversion', {
        send_to: CONVERSION_ADS,
        transaction_id: userId,
        value: valor,
        currency: 'EUR',
      });
    }
  } catch { /* sin efecto si no hay analítica */ }
};

(async () => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    ponerCabecera('ok', 'Pago recibido');
    mostrarPaso('paso-sin-sesion');
    return;
  }

  if (session.user.email) {
    $('correo-cuenta').textContent = session.user.email;
  }

  for (let intento = 0; intento < INTENTOS; intento++) {
    const suscripcion = await estaVigente(session.user.id);
    if (suscripcion) {
      ponerCabecera('ok', 'Ja ets premium!');
      mostrarPaso('paso-activa');
      medirLaVenta(session.user.id, suscripcion.venceEn);
      return;
    }
    await dormir(ESPERA_MS);
  }

  // Se agotó la espera. El pago está hecho: eso no se pone en duda en ningún
  // texto de este estado.
  ponerCabecera('espera', 'Pago recibido');
  mostrarPaso('paso-tarda');
})();
