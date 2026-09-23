document.addEventListener('DOMContentLoaded', () => {
  // Navbar scroll background change
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Mobile menu toggle
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      const icon = menuToggle.querySelector('i');
      if (navLinks.classList.contains('active')) {
        icon.classList.replace('fa-bars', 'fa-xmark');
      } else {
        icon.classList.replace('fa-xmark', 'fa-bars');
      }
    });

    // Close menu when clicking on a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        const icon = menuToggle.querySelector('i');
        icon.classList.replace('fa-xmark', 'fa-bars');
      });
    });
  }

  // Scroll Reveal - Fallback for browsers that do NOT support CSS Scroll-Driven Animations
  if (!CSS.supports('(animation-timeline: view()) and (animation-range: entry)')) {
    const observerOptions = {
      root: null, // viewport
      rootMargin: '0px 0px -80px 0px', // trigger slightly before entering viewport
      threshold: 0.1 // at least 10% visible
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target); // animate only once
        }
      });
    }, observerOptions);

    document.querySelectorAll('.reveal-on-scroll').forEach(el => {
      revealObserver.observe(el);
    });
  }

  // Aquí vivía el manejador del formulario «Solicitar Alta Gratuita», que
  // componía un mensaje y abría WhatsApp para que alguien mandara credenciales
  // a mano. Se retiró el 11-09-2026 junto con el formulario: los 10 portes de
  // prueba NO son una promoción que haya que solicitar —los trae cualquier
  // cuenta nueva— y la contraseña la elige el propio conductor al registrarse.
  // Ahora los botones de «probar gratis» llevan a app.micarga.es/?registro.

  // Back to Top Button Interaction
  const backToTopBtn = document.getElementById('back-to-top');
  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    });

    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // --- Los vídeos de la página ---------------------------------------------
  //
  // Hay dos —el del hero y el de «cómo funciona»— y los dos se comportan
  // igual: no arrancan solos. Se enseña el fotograma con el botón de play
  // encima y no pasa nada hasta que alguien lo pulsa. Los dos llevan voz, y
  // sonar sin que nadie lo haya pedido —en una cabina, en una oficina— es la
  // forma más rápida de que cierren la pestaña.
  //
  // Los controles aparecen AL EMPEZAR, no antes: con la barra de controles
  // encima del fotograma, el botón de play grande compite con el pequeño de la
  // barra y no se sabe cuál es el bueno. Una vez en marcha sí hacen falta, para
  // poder pararlo o quitarle el sonido.
  //
  // Una sola función para los dos: hasta el 22-09-2026 el de «cómo funciona»
  // eran cuatro tarjetas que abrían una ventana modal, con su propio código
  // aparte. Ahora es un vídeo más, así que se comporta como el otro.
  const prepararVideo = (idVideo, idBoton, esperaFinalMs) => {
    const video = document.getElementById(idVideo);
    const botonPlay = document.getElementById(idBoton);
    if (!video || !botonPlay) { return; }

    botonPlay.addEventListener('click', () => {
      botonPlay.hidden = true;
      video.controls = true;
      // `play()` devuelve una promesa que el navegador puede rechazar (una
      // política de reproducción, un fallo de red). Si pasa, se deja el
      // fotograma y el botón como estaban en vez de quedarse en una pantalla
      // negra sin explicación.
      const arrancando = video.play();
      if (arrancando) {
        arrancando.catch(() => {
          botonPlay.hidden = false;
          video.controls = false;
        });
      }
    });

    // Al terminar se ve una vez, y quien quiera repetirlo lo pide otra vez.
    //
    // La espera es a propósito: los dos vídeos acaban con el logo de Mi Carga
    // en pantalla, y volver al fotograma inicial en el mismo instante en que
    // aparece se lleva por delante justo el cierre de la pieza. Se deja
    // respirar y luego se vuelve al principio.
    //
    // `load()` es lo que devuelve el póster a la pantalla; con
    // `currentTime = 0` se quedaría congelado el último cuadro.
    video.addEventListener('ended', () => {
      video.controls = false;
      setTimeout(() => {
        video.load();
        botonPlay.hidden = false;
      }, esperaFinalMs);
    });
  };

  prepararVideo('video-hero', 'video-play', 3000);
  prepararVideo('video-completo', 'video-completo-play', 3000);

  // --- El carrusel del equipo ----------------------------------------------
  //
  // ⚠️ AQUÍ NO SE ESCRIBE NI UNA PALABRA, SOLO NÚMEROS. `script.js` NO está en
  // la lista SCRIPTS de `herramientas/i18n.py`, así que no pasa por el
  // generador: un «1 de 6» montado desde aquí saldría en castellano en los
  // ocho idiomas. El «de» vive en el HTML, partido entre dos <span>, y de aquí
  // sale únicamente la cifra de la izquierda.
  //
  // El desplazamiento de verdad lo hace el navegador: la tira es un scroller
  // con `scroll-snap` y estos botones no son más que un `scrollTo`. Si este
  // archivo no llegase a cargar, el carrusel seguiría moviéndose con el dedo y
  // con la rueda; lo único que se perdería son las flechas.
  const carrusel = document.querySelector('[data-carrusel]');
  if (carrusel) {
    const tarjetas = [...carrusel.children];
    const atras = document.querySelector('[data-carrusel-anterior]');
    const alante = document.querySelector('[data-carrusel-siguiente]');
    const desde = document.querySelector('[data-carrusel-desde]');
    const hasta = document.querySelector('[data-carrusel-hasta]');
    const tramo = document.querySelector('[data-carrusel-tramo]');
    let actual = 0;

    // Cuántas caben a la vista. Se mide, no se deduce de un punto de corte:
    // los anchos de las tarjetas los pone el CSS y aquí no hay por qué saber
    // en qué píxel cambia. Así mover el punto de corte no obliga a tocar esto.
    const aLaVista = () => {
      if (!tarjetas.length) { return 1; }
      const ancho = tarjetas[0].getBoundingClientRect().width;
      if (!ancho) { return 1; }
      return Math.max(1, Math.round(carrusel.clientWidth / ancho));
    };

    const ultima = () => Math.max(0, tarjetas.length - aLaVista());

    const repintar = () => {
      actual = Math.min(actual, ultima());
      if (atras) { atras.disabled = actual === 0; }
      if (alante) { alante.disabled = actual >= ultima(); }
      // Se enseña el TRAMO a la vista —«4–6 de 6»— y no solo la primera. Con
      // un número suelto, al llegar al final ponía «4 de 6» con las tres
      // últimas delante y la flecha apagada: parecía que faltaban dos.
      // Cuentan desde 1, no desde 0.
      const fin = Math.min(tarjetas.length, actual + aLaVista());
      if (desde) { desde.textContent = String(actual + 1); }
      if (hasta) { hasta.textContent = String(fin); }
      // Cuando solo cabe una tarjeta —el móvil— se esconde el tramo entero,
      // guion incluido: «1–1 de 6» no es un rango, es una errata.
      if (tramo) { tramo.hidden = fin === actual + 1; }
    };

    const ir = (paso) => {
      actual = Math.max(0, Math.min(ultima(), actual + paso));
      carrusel.scrollTo({
        left: tarjetas[actual].offsetLeft - tarjetas[0].offsetLeft,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto' : 'smooth',
      });
      repintar();
    };

    if (atras) { atras.addEventListener('click', () => ir(-1)); }
    if (alante) { alante.addEventListener('click', () => ir(1)); }

    // Las flechas del teclado solo mueven la tira cuando el foco está DENTRO.
    // Si se escuchasen en la ventana, las flechas dejarían de servir para
    // desplazar la página en cuanto el carrusel estuviera en pantalla.
    carrusel.addEventListener('keydown', (evento) => {
      if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') { return; }
      evento.preventDefault();
      ir(evento.key === 'ArrowRight' ? 1 : -1);
    });

    // Arrastrando con el dedo el número también tiene que seguir el movimiento:
    // se busca la tarjeta que ha quedado más cerca del borde izquierdo.
    carrusel.addEventListener('scroll', () => {
      let cerca = 0;
      let minima = Infinity;
      tarjetas.forEach((tarjeta, i) => {
        const d = Math.abs(tarjeta.offsetLeft - tarjetas[0].offsetLeft - carrusel.scrollLeft);
        if (d < minima) { minima = d; cerca = i; }
      });
      actual = cerca;
      repintar();
    }, { passive: true });

    window.addEventListener('resize', repintar);
    repintar();
  }

  // --- Calculadora de precio -----------------------------------------------
  //
  // ⚠️ AQUÍ NO SE ESCRIBE NI UNA PALABRA VISIBLE. `script.js` NO está en la
  // lista SCRIPTS de `herramientas/i18n.py`, así que no se traduce: una frase
  // puesta desde aquí saldría en castellano en los ocho idiomas. Todo el texto
  // vive en el HTML, que sí se traduce. Este código solo enseña, esconde y
  // pone números.
  //
  // Los precios salen de los `data-` de la sección, no de constantes de aquí:
  // así se cambian en un sitio y se ven leyendo la página.
  const calc = document.querySelector('[data-calc]');
  if (calc) {
    const precioMes = Number(calc.dataset.precioMes);
    const precioAno = Number(calc.dataset.precioAno);
    const crmMes = Number(calc.dataset.crmMes);
    const crmAno = Number(calc.dataset.crmAno);

    const pasos = {};
    calc.querySelectorAll('[data-paso]').forEach((p) => { pasos[p.dataset.paso] = p; });
    const resultado = calc.querySelector('[data-resultado]');
    const filaCrm = calc.querySelector('[data-fila="crm"]');
    const entrada = calc.querySelector('[data-conductores]');
    const ctaAutonomo = calc.querySelector('[data-cta-autonomo]');
    const ctaEmpresa = calc.querySelector('[data-cta-empresa]');
    const notaEmpresa = calc.querySelector('[data-nota-empresa]');

    let perfil = null;

    const pon = (selector, valor) => {
      const el = calc.querySelector(selector);
      if (el) el.textContent = String(valor);
    };

    // Los números se escriben con el separador de miles del idioma de la
    // página: 1.200 en castellano, 1,200 en inglés. `document.documentElement.lang`
    // lo pone el generador en cada versión.
    const idioma = document.documentElement.lang || 'es';
    const numero = (n) => new Intl.NumberFormat(idioma).format(n);

    const calcular = () => {
      // Un conductor como mínimo: con 0 el resultado sería 0 € y no significa
      // nada. `Math.floor` por si alguien teclea «2,5» en un campo numérico.
      let n = Math.floor(Number(entrada.value));
      if (!Number.isFinite(n) || n < 1) n = 1;
      if (n > 9999) n = 9999;

      const esEmpresa = perfil === 'empresa';

      const licMes = n * precioMes;
      const licAno = n * precioAno;
      // El CRM ya tiene precio anual propio (490 €, dos meses menos que pagarlo
      // mes a mes), así que se lee del `data-` y NO se multiplica por doce.
      const crmMesActual = esEmpresa ? crmMes : 0;
      const crmAnoActual = esEmpresa ? crmAno : 0;

      pon('[data-n]', numero(n));
      pon('[data-precio-licencia]', numero(precioMes));
      // El ahorro cubre TODO lo que se está enseñando, no solo las licencias:
      // con empresa, el CRM anual también ahorra dos meses, y poner solo el de
      // las licencias se quedaría corto justo en el caso que más paga.
      const conPlanAnual = licAno + crmAnoActual;
      const sinPlanAnual = (licMes + crmMesActual) * 12;
      pon('[data-ahorro-con]', numero(conPlanAnual));
      pon('[data-ahorro-sin]', numero(sinPlanAnual));
      pon('[data-ahorro]', numero(sinPlanAnual - conPlanAnual));
      pon('[data-lic-mes]', numero(licMes));
      pon('[data-lic-ano]', numero(licAno));
      pon('[data-imp-crm-mes]', numero(crmMesActual));
      pon('[data-imp-crm-ano]', numero(crmAnoActual));

      // El botón de presupuesto se lleva el número puesto, para que el
      // formulario llegue medio hecho.
      //
      // ⚠️ SE CONSERVA EL CAMINO QUE YA TENÍA EL ENLACE y solo se le cambia la
      // parte de la interrogación. El generador de idiomas reescribe ese
      // `href` a `/de/presupuesto`, `/pl/presupuesto`…; si aquí se pusiera la
      // ruta a pelo, la versión alemana mandaría al formulario en castellano.
      if (ctaEmpresa) {
        const destino = ctaEmpresa.getAttribute('href').split('?')[0];
        ctaEmpresa.setAttribute('href', `${destino}?cuentas=${n}`);
      }

      filaCrm.hidden = !esEmpresa;
      if (ctaAutonomo) ctaAutonomo.hidden = esEmpresa;
      if (ctaEmpresa) ctaEmpresa.hidden = !esEmpresa;
      if (notaEmpresa) notaEmpresa.hidden = !esEmpresa;
    };

    // Qué bloques se ven en cada momento.
    //
    // 🚨 EL PASO «CUÁNTOS SOIS» ENSEÑA TAMBIÉN EL RESULTADO, y no es un
    // capricho: antes no lo hacía y la calculadora se quedaba encallada ahí.
    // El único camino al precio era ESCRIBIR en el campo, porque solo el
    // evento `input` llevaba al resultado. Quien pulsaba los botones + y −, o
    // quien se quedaba con el número que viene puesto, veía cambiar la cifra y
    // nada más: ni precio, ni botones de contacto. Reportado el 21-09-2026.
    //
    // Enseñar las dos cosas a la vez lo arregla de raíz en lugar de parchear
    // un camino: es una calculadora, el precio se actualiza mientras se elige
    // el número y no hace falta ningún botón de «calcular».
    const enseñar = (nombre) => {
      Object.values(pasos).forEach((p) => { p.hidden = true; });
      resultado.hidden = true;

      if (nombre !== 'resultado') pasos[nombre].hidden = false;

      if (nombre === 'resultado' || nombre === 'cuantos') {
        resultado.hidden = false;
        calcular();
      }
    };

    calc.addEventListener('click', (e) => {
      const opcion = e.target.closest('[data-elige]');
      if (opcion) {
        const { elige, valor } = opcion.dataset;
        if (elige === 'perfil') {
          perfil = valor;
          if (valor === 'empresa') {
            entrada.value = '5';
            enseñar('cuantos');
          } else {
            enseñar('solo');
          }
        } else if (elige === 'solo') {
          if (valor === 'si') {
            entrada.value = '1';
            enseñar('resultado');
          } else {
            entrada.value = '2';
            enseñar('cuantos');
          }
        }
        return;
      }

      const suma = e.target.closest('[data-suma]');
      if (suma) {
        const n = Math.max(1, Math.floor(Number(entrada.value) || 1) + Number(suma.dataset.suma));
        entrada.value = String(n);
        // Siempre, no «si ya se veía»: en el paso de «cuántos sois» el
        // resultado está a la vista desde el primer momento.
        calcular();
        return;
      }

      if (e.target.closest('[data-reiniciar]')) {
        perfil = null;
        entrada.value = '2';
        enseñar('perfil');
        return;
      }
    });

    // Desde el paso «cuántos sois» se pasa al resultado en cuanto se escribe,
    // sin un botón de «calcular»: es una calculadora, no un formulario.
    entrada.addEventListener('input', calcular);
    // Enter no envía nada —no hay formulario— pero la gente lo pulsa igual.
    entrada.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
  }

});
