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

  // --- Vídeo del hero ------------------------------------------------------
  //
  // No arranca solo. Se enseña el fotograma con el botón de play encima y no
  // pasa nada hasta que alguien lo pulsa: el vídeo lleva voz, y sonar sin que
  // nadie lo haya pedido —en una cabina, en una oficina— es la forma más
  // rápida de que cierren la pestaña.
  //
  // Los controles aparecen AL EMPEZAR, no antes: con la barra de controles
  // encima del fotograma, el botón de play grande compite con el pequeño de la
  // barra y no se sabe cuál es el bueno. Una vez en marcha sí hacen falta, para
  // poder pararlo o quitarle el sonido.
  const video = document.getElementById('video-hero');
  const botonPlay = document.getElementById('video-play');

  if (video && botonPlay) {
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
    // Los tres segundos de espera son a propósito: el vídeo acaba con el logo
    // de Mi Carga en pantalla, y volver al fotograma inicial en el mismo
    // instante en que aparece se lleva por delante justo el cierre de la
    // pieza. Se deja respirar y luego se vuelve al principio.
    //
    // `load()` es lo que devuelve el póster a la pantalla; con
    // `currentTime = 0` se quedaría congelado el último cuadro.
    const ESPERA_FINAL_MS = 3000;
    video.addEventListener('ended', () => {
      video.controls = false;
      setTimeout(() => {
        video.load();
        botonPlay.hidden = false;
      }, ESPERA_FINAL_MS);
    });
  }

  // --- Los cuatro vídeos de «cómo funciona» ---------------------------------
  //
  // Una sola ventana para los cuatro: al pulsar una tarjeta se le cambia el
  // origen al <video> y se abre. Así no hay cuatro reproductores en la página
  // compitiendo por la memoria del móvil.
  //
  // El <source> se pone con `src` directo sobre el <video>, no con una etiqueta
  // <source> hija: cambiar un <source> hijo no hace nada si no se llama a
  // `load()`, y esto es menos código y menos sitios donde equivocarse.
  const ventana = document.getElementById('video-ventana');
  const reproductor = document.getElementById('video-ventana-pieza');
  const tituloVentana = document.getElementById('video-ventana-titulo');
  const finalVentana = document.getElementById('video-ventana-final');
  const repetir = document.getElementById('video-ventana-repetir');
  const tarjetas = document.querySelectorAll('.video-tarjeta');

  if (ventana && reproductor && tarjetas.length) {
    const arrancar = () => {
      finalVentana.hidden = true;
      const enMarcha = reproductor.play();
      // El navegador puede negarse a arrancar (una política de reproducción, un
      // fallo de red). No se hace nada: quedan los controles del reproductor a
      // la vista y se le puede dar al play a mano.
      if (enMarcha) { enMarcha.catch(() => {}); }
    };

    tarjetas.forEach((tarjeta) => {
      tarjeta.addEventListener('click', () => {
        const fuente = tarjeta.dataset.video;
        if (!fuente) { return; }
        // El título se saca del <strong> de la propia tarjeta y no de un
        // atributo aparte: el generador de /ca y /en traduce el texto que se
        // ve, no los `data-*`, y con un `data-titulo` la ventana salía en
        // castellano encima de una página en catalán.
        const rotulo = tarjeta.querySelector('.video-tarjeta-pie strong');
        tituloVentana.textContent = rotulo ? rotulo.textContent.trim() : '';
        reproductor.src = fuente;
        reproductor.currentTime = 0;
        finalVentana.hidden = true;
        // `showModal` en vez de `show`: deja el resto de la página inerte, mete
        // el foco dentro y hace que Escape cierre, todo sin escribirlo.
        if (typeof ventana.showModal === 'function') {
          ventana.showModal();
        } else {
          ventana.setAttribute('open', '');
        }
        arrancar();
      });
    });

    reproductor.addEventListener('ended', () => { finalVentana.hidden = false; });
    if (repetir) { repetir.addEventListener('click', arrancar); }

    const cerrar = () => {
      if (typeof ventana.close === 'function') {
        ventana.close();
      } else {
        ventana.removeAttribute('open');
      }
    };

    ventana.querySelectorAll('[data-cerrar-video]').forEach((boton) => {
      boton.addEventListener('click', cerrar);
    });

    // Pulsar el fondo oscuro también cierra. El <dialog> recibe el clic del
    // ::backdrop como si fuese suyo, así que basta con mirar si el clic cayó
    // fuera de la caja de dentro.
    ventana.addEventListener('click', (evento) => {
      if (evento.target === ventana) { cerrar(); }
    });

    // Se limpia SIEMPRE al cerrar, venga el cierre de donde venga —la X, el
    // fondo o la tecla Escape—. Vaciar el `src` es lo que corta de verdad la
    // descarga y el sonido; con `pause()` a secas el vídeo sigue bajando por
    // detrás.
    ventana.addEventListener('close', () => {
      reproductor.pause();
      reproductor.removeAttribute('src');
      reproductor.load();
      finalVentana.hidden = true;
    });
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
      // El CRM no tiene precio anual propio publicado: se cobra por meses, así
      // que el año son doce mensualidades SIN descuento. El ahorro de tres
      // meses es solo de las licencias, y el texto lo dice así de claro. Si
      // algún día hay precio anual de CRM, se añade un `data-` y se cambia
      // esta línea, no el resto.
      const crmMesActual = esEmpresa ? crmMes : 0;
      const crmAnoActual = crmMesActual * 12;

      pon('[data-n]', numero(n));
      pon('[data-precio-licencia]', numero(precioMes));
      // El ahorro del plan anual, en total y no por licencia: es la cifra que
      // de verdad mira quien tiene flota.
      const sinPlanAnual = n * precioMes * 12;
      pon('[data-ahorro-con]', numero(licAno));
      pon('[data-ahorro-sin]', numero(sinPlanAnual));
      pon('[data-ahorro]', numero(sinPlanAnual - licAno));
      pon('[data-lic-mes]', numero(licMes));
      pon('[data-lic-ano]', numero(licAno));
      pon('[data-imp-crm-mes]', numero(crmMesActual));
      pon('[data-imp-crm-ano]', numero(crmAnoActual));

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
