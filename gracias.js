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

const estaVigente = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', userId)
    .maybeSingle();
  if (error) return false;
  return VIGENTES.includes(data?.subscription_status);
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
    if (await estaVigente(session.user.id)) {
      ponerCabecera('ok', '¡Ya eres premium!');
      mostrarPaso('paso-activa');
      return;
    }
    await dormir(ESPERA_MS);
  }

  // Se agotó la espera. El pago está hecho: eso no se pone en duda en ningún
  // texto de este estado.
  ponerCabecera('espera', 'Pago recibido');
  mostrarPaso('paso-tarda');
})();
