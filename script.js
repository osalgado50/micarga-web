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
});
