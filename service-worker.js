/* SERVICE WORKER «DE BAJA» (11-10-2026).
 *
 * micarga.es NO tiene service worker. Pero cuando la app vivía aquí (antes de
 * app.micarga.es) instaló uno, y algunos navegadores lo siguen teniendo: se
 * queda con cualquier página de micarga.es y enseña la pantalla de entrada de
 * la app vieja en lugar de la página pedida (visto en un iPhone abriendo
 * /terminos desde la pantalla de compra de la app).
 *
 * Al buscar la versión nueva del viejo, el navegador descarga ESTE fichero, que
 * borra lo que tenía guardado, se da de baja y recarga las pestañas abiertas
 * para que pidan la página de verdad. No intercepta nada.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* nada que borrar */ }
    await self.registration.unregister();
    const pestanas = await self.clients.matchAll({ type: 'window' });
    for (const p of pestanas) { try { p.navigate(p.url); } catch (e) { /* la pestaña ya no está */ } }
  })());
});
