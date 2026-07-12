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

  // Form submission handler -> Redirect to WhatsApp
  const leadForm = document.getElementById('whatsapp-lead-form');
  if (leadForm) {
    leadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const name = document.getElementById('form-name').value.trim();
      const phone = document.getElementById('form-phone').value.trim();
      const trucks = document.getElementById('form-trucks').value;
      const notes = document.getElementById('form-message').value.trim();
      
      // WhatsApp Business Number (Provisional)
      const targetPhone = '34640216351'; 
      
      // Message template in Spanish
      let whatsappMessage = `Hola! Vengo de la web *micarga.es* y me gustaría activar los *10 transportes de prueba gratis*.\n\n`;
      whatsappMessage += `*Mis datos de contacto:*\n`;
      whatsappMessage += `• *Nombre/Empresa:* ${name}\n`;
      whatsappMessage += `• *Teléfono:* ${phone}\n`;
      whatsappMessage += `• *Flota actual:* ${trucks}\n`;
      
      if (notes) {
        whatsappMessage += `• *Comentarios:* ${notes}\n`;
      }
      
      whatsappMessage += `\nQuedo a la espera de recibir mis credenciales de acceso para probar la app. ¡Gracias!`;
      
      // Open WhatsApp in a new tab
      const whatsappUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(whatsappMessage)}`;
      window.open(whatsappUrl, '_blank');
      
      // Optional: show a small success message on screen
      const originalButtonText = leadForm.querySelector('button[type="submit"]').innerHTML;
      leadForm.querySelector('button[type="submit"]').innerHTML = '<i class="fa-solid fa-check"></i> ¡Solicitud enviada!';
      leadForm.querySelector('button[type="submit"]').style.background = '#22c55e';
      
      setTimeout(() => {
        leadForm.reset();
        leadForm.querySelector('button[type="submit"]').innerHTML = originalButtonText;
        leadForm.querySelector('button[type="submit"]').style.background = '';
      }, 5000);
    });
  }

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
