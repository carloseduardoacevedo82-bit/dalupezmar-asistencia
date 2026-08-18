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
  if (isLight) {
    document.documentElement.classList.add('light-mode');
    document.documentElement.classList.remove('dark-mode');
    if (document.body) {
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-mode');
    }
  } else {
    document.documentElement.classList.add('dark-mode');
    document.documentElement.classList.remove('light-mode');
    if (document.body) {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
    }
  }
  localStorage.setItem('app-theme', theme);
  updateThemeButtonsUI(theme);
}

function toggleAppTheme() {
  const current = getSavedTheme();
  const next = current === 'light' ? 'dark' : 'light';
  applyAppTheme(next);
  showToast(`Cambiado a ${next === 'light' ? 'Modo Claro ☀️' : 'Modo Oscuro 🌙'}`, 'info');
}

function updateThemeButtonsUI(theme) {
  const isLight = theme === 'light';
  const btns = document.querySelectorAll('.btn-theme-toggle');
  btns.forEach(btn => {
    btn.innerHTML = isLight 
      ? '<i data-lucide="moon" class="w-4 h-4 text-slate-800"></i><span class="hidden sm:inline text-xs font-bold text-slate-800">Modo Oscuro</span>'
      : '<i data-lucide="sun" class="w-4 h-4 text-amber-300"></i><span class="hidden sm:inline text-xs font-bold text-amber-300">Modo Claro</span>';
    btn.setAttribute('title', isLight ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro');
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

  // Conectar todos los botones de cambio de tema
  document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleAppTheme();
    });
  });

  // Verificar si la página requiere autenticación (todas excepto login y kiosco)
  const path = window.location.pathname;
  const isLoginPage = path.endsWith('index.html') || path === '/' || path.endsWith('/public/');
  const isKioskPage = path.endsWith('kiosk.html');
  const isRemotePage = path.endsWith('remote-attendance.html');

  const token = api.getToken();
  const user = api.getUser();

  if (!token && !isLoginPage && !isKioskPage && !isRemotePage) {
    window.location.href = '/index.html';
    return;
  }

  // Si está en login y ya tiene token válido, enviar al dashboard
  if (token && isLoginPage) {
    window.location.href = '/dashboard.html';
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
