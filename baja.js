// La página de baja de los correos de campaña (baja.html). En fichero aparte
// y no en línea: la CSP de _headers solo deja scripts propios o con hash.
// Dos formas de llegar: con ?t=<token> desde el enlace del correo (la baja
// se hace aquí, llamando a la función), o con ?r=<resultado> cuando la
// función ya la hizo y redirigió (clic en un enlace antiguo).
(function () {
  var q = new URLSearchParams(location.search);
  var ver = function (r) {
    document.getElementById('r-espera').hidden = true;
    document.getElementById('r-' + (r === 'ok' || r === 'prueba' ? r : 'no')).hidden = false;
  };
  var t = q.get('t');
  if (!t) { ver(q.get('r')); return; }
  document.getElementById('r-espera').hidden = false;
  fetch('https://yrwletmszkfvnpbkngek.supabase.co/functions/v1/campana-baja?t=' + encodeURIComponent(t),
        { method: 'POST', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (j) { ver(j.r); })
    .catch(function () { ver('no'); });
})();
