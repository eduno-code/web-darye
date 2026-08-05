// ===== MENÚ MÓVIL CON MEJORAS UX =====
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('.nav-menu');
const navLinks = document.querySelectorAll('.nav-link');
const header = document.querySelector('.header');

// Función para abrir/cerrar menú
function toggleMenu() {
    const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', !isExpanded);
    navMenu.classList.toggle('active');
    
    // Animación del botón hamburguesa mejorada
    const spans = menuToggle.querySelectorAll('span');
    if (!isExpanded) {
        spans[0].style.transform = 'rotate(45deg) translate(6px, 6px)';
        spans[0].style.width = '25px';
        spans[1].style.opacity = '0';
        spans[1].style.transform = 'translateX(-10px)';
        spans[2].style.transform = 'rotate(-45deg) translate(6px, -6px)';
        spans[2].style.width = '25px';
        
        // Prevenir scroll cuando el menú está abierto
        document.body.style.overflow = 'hidden';
    } else {
        spans[0].style.transform = 'none';
        spans[0].style.width = '25px';
        spans[1].style.opacity = '1';
        spans[1].style.transform = 'none';
        spans[2].style.transform = 'none';
        spans[2].style.width = '25px';
        
        // Restaurar scroll
        document.body.style.overflow = '';
    }
}

// Event listener para menú móvil
if (menuToggle) {
    menuToggle.addEventListener('click', toggleMenu);
}

// Cerrar menú al hacer clic en un enlace
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        if (navMenu && navMenu.classList.contains('active')) {
            toggleMenu();
        }
        
        // Remover active de todos los links
        navLinks.forEach(l => l.removeAttribute('aria-current'));
        
        // Agregar active al link clickeado
        e.target.setAttribute('aria-current', 'page');
    });
});

// ===== SMOOTH SCROLL MEJORADO =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        
        if (targetId === '#') return;
        
        const target = document.querySelector(targetId);
        
        if (target) {
            const headerOffset = 100;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
            
            // Actualizar URL sin recargar
            history.pushState(null, null, targetId);
        }
    });
});



// ===== RESALTAR ENLACE ACTIVO CON OBSERVADOR =====
const sections = document.querySelectorAll('section[id]');

function highlightNavLink() {
    const scrollY = window.pageYOffset;
    
    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 120;
        const sectionId = section.getAttribute('id');
        const navLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
        
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            navLink?.setAttribute('aria-current', 'page');
        } else {
            navLink?.removeAttribute('aria-current');
        }
    });
}

window.addEventListener('scroll', highlightNavLink);

// ===== HEADER SCROLL EFFECT =====
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll <= 0) {
        header.style.transform = 'translateY(0)';
        return;
    }
    
    if (currentScroll > lastScroll && currentScroll > 100) {
        // Scroll hacia abajo - ocultar header
        header.style.transform = 'translateY(-100%)';
    } else {
        // Scroll hacia arriba - mostrar header
        header.style.transform = 'translateY(0)';
    }
    
    lastScroll = currentScroll;
});

// ===== LAZY LOADING PARA IMÁGENES =====
if ('loading' in HTMLImageElement.prototype) {
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
        img.loading = 'lazy';
    });
} else {
    // Fallback para navegadores antiguos
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
    document.body.appendChild(script);
}

// ===== ANIMACIÓN DE ENTRADA CON INTERSECTION OBSERVER =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observar elementos para animación
document.querySelectorAll('.service-card, .story-content, .hero-content').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
    observer.observe(el);
});