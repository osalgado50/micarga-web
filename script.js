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
});
