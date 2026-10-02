// La dirección del proyecto de Supabase y su clave publicable, en UN solo
// sitio para toda la web.
//
// POR QUÉ (auditoría 02-10-2026, REL-18 y SEG-59): estaban escritas tal cual en
// 37 ficheros —los cinco scripts de la raíz y sus copias en los ocho idiomas—.
// Rotar la clave o apuntar a un proyecto de pruebas obligaba a tocarlos todos,
// y el que se olvidara seguiría hablando con el proyecto viejo.
//
// La clave publicable es pública por diseño: va también dentro de la app y del
// bundle de app.micarga.es. Lo que protege los datos es RLS, no esconderla.
//
// Lo importan los scripts con ruta absoluta ('/config.js?v=…'), así que las
// copias de cada idioma usan este mismo fichero: no se traduce ni se duplica.
// ⚠️ Al cambiar algo aquí, subir su ?v= en los imports (suscripcion.js,
// borrar-cuenta.js, gracias.js, contacto.js y presupuesto.js).

export const SUPABASE_URL = 'https://yrwletmszkfvnpbkngek.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_sOknpnTQXY0CqOMyv-UZSw_cYjp2YzO';

/** La URL de una Edge Function del proyecto. */
export const urlDeFuncion = (nombre) => `${SUPABASE_URL}/functions/v1/${nombre}`;
