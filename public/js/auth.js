/**
 * =========================================================================
 * GESTOR GLOBAL DE TEMA (MODO CLARO / MODO OSCURO)
 * =========================================================================
 */
function getSavedTheme() {
  return localStorage.getItem('app-theme') || 'dark';
}

function applyAppTheme(theme) {
  const isLight = theme === 'light';
  const root = document.documentElement;
  const body = document.body;

  if (isLight) {
    root.classList.add('light-mode');
    root.classList.remove('dark', 'dark-mode');
    if (body) {
      body.classList.add('light-mode');
      body.classList.remove('dark', 'dark-mode');
    }
  } else {
    root.classList.add('dark', 'dark-mode');
    root.classList.remove('light-mode');
    if (body) {
      body.classList.add('dark', 'dark-mode');
      body.classList.remove('light-mode');
    }
  }
  localStorage.setItem('app-theme', theme);
  updateThemeButtonsUI(theme);

  // Sincronizar instantáneamente con el iframe interno si existe
  try {
    const frame = document.getElementById('main-app-frame');
    if (frame && frame.contentDocument) {
      const fRoot = frame.contentDocument.documentElement;
      const fBody = frame.contentDocument.body;
      if (isLight) {
        fRoot.classList.add('light-mode');
        fRoot.classList.remove('dark', 'dark-mode');
        if (fBody) {
          fBody.classList.add('light-mode');
          fBody.classList.remove('dark', 'dark-mode');
        }
      } else {
        fRoot.classList.add('dark', 'dark-mode');
        fRoot.classList.remove('light-mode');
        if (fBody) {
          fBody.classList.add('dark', 'dark-mode');
          fBody.classList.remove('light-mode');
        }
      }
    }
  } catch (e) {}
}

function toggleAppTheme() {
  // Si está dentro de un iframe con app.html padre, delegar al padre
  if (window.self !== window.top && window.parent && window.parent.toggleAppTheme) {
    window.parent.toggleAppTheme();
    return;
  }

  const current = getSavedTheme();
  const next = current === 'light' ? 'dark' : 'light';
  applyAppTheme(next);
  showToast(`Cambiado a ${next === 'light' ? 'Modo Claro ☀️' : 'Modo Oscuro 🌙'}`, 'info');
}

function updateThemeButtonsUI(theme) {
  const isLight = theme === 'light';
  const btns = document.querySelectorAll('.btn-theme-toggle');
  btns.forEach(btn => {
    btn.setAttribute('title', isLight ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro');
    btn.className = `btn-theme-toggle relative w-12 h-6.5 rounded-full transition-all duration-300 p-0.5 flex items-center cursor-pointer select-none shadow-sm ${
      isLight ? 'bg-sky-100 border border-sky-300 justify-end' : 'bg-slate-800 border border-slate-700 justify-start'
    }`;
    btn.innerHTML = `
      <span class="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 transform shadow-sm ${
        isLight 
          ? 'bg-white text-indigo-600 shadow-sky-200 rotate-0' 
          : 'bg-slate-900 text-amber-400 shadow-slate-950 rotate-180'
      }">
        <i data-lucide="${isLight ? 'moon' : 'sun'}" class="w-3.5 h-3.5"></i>
      </span>
    `;
  });
  if (window.lucide && lucide.createIcons) lucide.createIcons();
}

// Aplicación inmediata del tema al cargar el script (Anti-Flicker)
applyAppTheme(getSavedTheme());

// Detección inmediata de contenedor único (eliminar cabeceras duplicadas)
if (window.self !== window.top) {
  document.documentElement.classList.add('is-embedded');
  if (document.body) document.body.classList.add('is-embedded');
}

/**
 * Gestión de sesión, navegación y alertas en el frontend
 */
document.addEventListener('DOMContentLoaded', () => {
  if (window.self !== window.top) {
    document.documentElement.classList.add('is-embedded');
    document.body?.classList.add('is-embedded');
    const innerNav = document.querySelector('nav.glass-nav');
    if (innerNav) innerNav.style.display = 'none';
  }

  // Asegurar tema en body
  applyAppTheme(getSavedTheme());

  // Conectar botones de cambio de tema SIN duplicar listeners
  document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    if (!btn.getAttribute('onclick')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAppTheme();
      });
    }
  });

  // Verificar si la página requiere autenticación (todas excepto login, kiosco y portal del trabajador)
  const path = window.location.pathname;
  const isLoginPage = path.endsWith('index.html') || path === '/' || path.endsWith('/public/');
  const isKioskPage = path.endsWith('kiosk.html');
  const isRemotePage = path.endsWith('remote-attendance.html');
  const isWorkerPortal = path.includes('portal-trabajador') || path.includes('trabajador');

  const token = api.getToken();
  const user = api.getUser();

  if (!token && !isLoginPage && !isKioskPage && !isRemotePage && !isWorkerPortal) {
    window.location.href = '/index.html';
    return;
  }

  // Si está en login y ya tiene token válido, enviar al dashboard o portal
  if (token && isLoginPage) {
    const isWorker = localStorage.getItem('dalupezmar_worker_user') && (!user || user.role === 'WORKER');
    if (isWorker) {
      window.location.href = '/portal-trabajador.html';
    } else {
      window.location.href = '/dashboard.html';
    }
    return;
  }

  // Renderizar información del usuario en la barra superior si existe
  const userNameEl = document.getElementById('nav-user-name');
  const userRoleEl = document.getElementById('nav-user-role');
  if (userNameEl && user) {
    userNameEl.textContent = user.full_name || user.username;
  }
  if (userRoleEl && user) {
    userRoleEl.textContent = user.role;
  }

  // Evento de cierre de sesión
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        api.clearSession();
        window.location.href = '/index.html';
      }
    });
  }
});

/**
 * Muestra notificación toast moderna
 */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600/90 border-emerald-400 text-white',
    error: 'bg-rose-600/90 border-rose-400 text-white',
    info: 'bg-blue-600/90 border-blue-400 text-white',
    warning: 'bg-amber-600/90 border-amber-400 text-white'
  };

  toast.className = `fixed bottom-5 right-5 z-50 px-5 py-3 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-y-10 opacity-0 flex items-center gap-3 ${colors[type] || colors.info}`;
  
  toast.innerHTML = `
    <span class="text-sm font-semibold">${message}</span>
  `;

  document.body.appendChild(toast);

  // Animación de entrada
  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 50);

  // Desaparición
  setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// =========================================================================
// BLOQUEO DEFINITIVO DE DESPLAZAMIENTO HORIZONTAL EN DISPOSITIVOS TÁCTILES
// =========================================================================
let _touchStartX = 0;
let _touchStartY = 0;

window.addEventListener('touchstart', (e) => {
  if (e.touches && e.touches.length === 1) {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!e.touches || e.touches.length !== 1) return;
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = Math.abs(currentX - _touchStartX);
  const diffY = Math.abs(currentY - _touchStartY);

  // Si el movimiento es predominantemente horizontal
  if (diffX > diffY && diffX > 6) {
    // Permitir solo dentro de contenedores explícitos de tablas con scroll horizontal
    let target = e.target;
    let allowHorizontal = false;
    while (target && target !== document.body && target !== document.documentElement) {
      if (target.classList && (target.classList.contains('overflow-x-auto') || target.classList.contains('table-responsive'))) {
        allowHorizontal = true;
        break;
      }
      target = target.parentElement;
    }

    if (!allowHorizontal && e.cancelable) {
      e.preventDefault();
    }
  }
}, { passive: false });

