import { api } from './api.js';
import { $, e, tickTimers, toast, errorBox } from './ui.js';

const routes = [
  ['/', () => import('./views/landing.js')],
  ['/ofertas', () => import('./views/market.js')],
  ['/oferta/:id', () => import('./views/lot.js')],
  ['/mapa', () => import('./views/map.js')],
  ['/impacto', () => import('./views/impact.js')],
  ['/entrar', () => import('./views/auth.js'), { mode: 'login' }],
  ['/registro', () => import('./views/auth.js'), { mode: 'register' }],
  ['/productor', () => import('./views/producer.js'), { role: 'productor' }],
  ['/productor/pedidos', () => import('./views/producerOrders.js'), { role: 'productor' }],
  ['/publicar', () => import('./views/publish.js'), { role: 'productor' }],
  ['/comprador', () => import('./views/buyer.js'), { role: 'comprador' }],
  ['/pedido/:folio', () => import('./views/order.js'), { auth: true }],
  ['/perfil', () => import('./views/profile.js'), { auth: true }],
  ['/admin', () => import('./views/admin.js'), { role: 'admin' }],
  ['/transportista', () => import('./views/carrier.js'), { role: 'transportista' }],
  ['/flete/:id', () => import('./views/trip.js'), { auth: true }],
  ['/privacidad', () => import('./views/legal.js'), { page: 'privacidad' }],
  ['/creditos', () => import('./views/legal.js'), { page: 'creditos' }],
];

export const state = { user: null, unread: null };
let cleanups = [];
export const onLeave = (fn) => cleanups.push(fn);
export const go = (hash) => (location.hash = hash);

const NAV = {
  guest: [['#/ofertas', '🧺', 'Ofertas'], ['#/mapa', '🗺️', 'Mapa'], ['#/impacto', '📊', 'Impacto'], ['#/entrar', '👤', 'Entrar']],
  productor: [['#/productor', '🏠', 'Inicio'], ['#/productor/pedidos', '📦', 'Pedidos'], ['#/publicar', '＋', 'Publicar', true], ['#/ofertas', '🧺', 'Ofertas'], ['#/perfil', '👤', 'Perfil']],
  comprador: [['#/ofertas', '🧺', 'Ofertas'], ['#/mapa', '🗺️', 'Mapa'], ['#/comprador', '📦', 'Pedidos'], ['#/impacto', '📊', 'Impacto'], ['#/perfil', '👤', 'Perfil']],
  transportista: [['#/transportista', '🚚', 'Viajes'], ['#/transportista?tab=mios', '🧭', 'Mis viajes'], ['#/impacto', '📊', 'Impacto'], ['#/perfil', '👤', 'Perfil']],
  admin: [['#/admin', '🛡️', 'Admin'], ['#/ofertas', '🧺', 'Ofertas'], ['#/impacto', '📊', 'Impacto'], ['#/perfil', '👤', 'Perfil']],
};

export function renderNav() {
  const items = NAV[state.user?.role || 'guest'];
  const full = '#' + (location.hash.slice(1) || '/');
  const cur = full.split('?')[0];
  const isActive = (h) => (h.includes('?') ? full === h : cur === h && !(h === '#/transportista' && full.includes('tab=mios'))) || (h !== '#/' && cur.startsWith(h + '/') && h !== '#/productor');
  $('#bottomnav').innerHTML = items
    .map(([h, i, l, fab]) => `<a href="${h}" class="${fab ? 'fab' : isActive(h) ? 'active' : ''}" aria-label="${e(l)}"><span aria-hidden="true">${i}</span>${fab ? '' : e(l)}</a>`)
    .join('');
  $('#topnav').innerHTML = items
    .map(([h, , l]) => `<a href="${h}" class="${isActive(h) ? 'active' : ''}">${e(l)}</a>`)
    .join('');
  $('#topactions').innerHTML = state.user
    ? `<button class="bell" id="bell" aria-label="Avisos${state.unread ? `: ${state.unread} sin leer` : ''}">🔔${state.unread ? `<b>${state.unread}</b>` : ''}</button>
       <button class="btn ghost sm" id="logout">Salir</button>`
    : `<a class="btn sm" href="#/registro">Crear cuenta</a>`;
  $('#logout')?.addEventListener('click', logout);
  $('#bell')?.addEventListener('click', showNotifications);
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  state.unread = null;
  toast('Sesión cerrada');
  go('#/');
  renderNav();
}

async function showNotifications() {
  const { notifications } = await api('/api/notifications');
  await api('/api/notifications/read', { method: 'POST' });
  state.unread = 0;
  renderNav();
  const box = document.createElement('div');
  box.className = 'card';
  box.style.cssText = 'position:fixed;top:64px;right:12px;left:12px;max-width:420px;margin-left:auto;z-index:40;max-height:70vh;overflow:auto';
  box.innerHTML = `<div class="row between"><h3>Avisos</h3><button class="btn ghost sm" data-close>Cerrar</button></div>` +
    (notifications.length
      ? notifications.map((n) => `<a href="${e(n.link || '#/')}" style="display:block;padding:10px 0;border-top:1px solid var(--line);text-decoration:none;color:inherit">${n.read ? '' : '🟠 '}${e(n.text)}<div class="tiny muted">${new Date(n.created_at).toLocaleString('es-MX')}</div></a>`).join('')
      : '<p class="muted">Sin avisos por ahora.</p>');
  document.body.append(box);
  const close = () => box.remove();
  box.addEventListener('click', (ev) => (ev.target.closest('[data-close],a') ? close() : null));
  setTimeout(() => document.addEventListener('click', function h(ev) { if (!box.contains(ev.target)) { close(); document.removeEventListener('click', h); } }), 0);
}

async function pollNotifications() {
  if (!state.user || document.hidden) return;
  try {
    const { unread } = await api('/api/notifications');
    if (unread !== state.unread) {
      if (state.unread != null && unread > state.unread) toast('Tienes un aviso nuevo 🔔');
      state.unread = unread;
      renderNav();
    }
  } catch { /* sin conexión: se reintenta luego */ }
}

function match(path) {
  for (const [pattern, loader, opts = {}] of routes) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    const m = re.exec(path);
    if (m) return { loader, opts, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

async function router() {
  cleanups.forEach((f) => f());
  cleanups = [];
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  // Elemento nuevo en cada navegación: así no se acumulan escuchadores de eventos entre vistas.
  const old = $('#app');
  const app = old.cloneNode(false);
  old.replaceWith(app);
  renderNav();
  const r = match(path);
  if (!r) {
    app.innerHTML = `<div class="wrap page">${errorBox({ message: 'Esta página no existe.' }, '<a class="btn" href="#/">Ir al inicio</a>')}</div>`;
    return;
  }
  if ((r.opts.auth || r.opts.role) && !state.user) {
    sessionStorage.setItem('rd_after_login', location.hash);
    return go(`#/entrar`);
  }
  if (r.opts.role && state.user.role !== r.opts.role) {
    app.innerHTML = `<div class="wrap page">${errorBox({ message: 'Esta sección es para otro tipo de cuenta.' }, '<a class="btn" href="#/">Ir al inicio</a>')}</div>`;
    return;
  }
  app.innerHTML = '<div class="wrap page"><div class="skeleton" aria-label="Cargando"></div></div>';
  try {
    const mod = await r.loader();
    await mod.default({ app, params: r.params, query, opts: r.opts, state });
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="wrap page">${errorBox(err, '<button class="btn" id="reload">Reintentar</button>')}</div>`;
    $('#reload')?.addEventListener('click', () => location.reload());
  }
  tickTimers();
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

export async function refreshUser() {
  try {
    const { user } = await api('/api/me');
    state.user = user;
  } catch {
    state.user = JSON.parse(localStorage.getItem('rd_user') || 'null'); // sin conexión: última sesión conocida
  }
  if (state.user) localStorage.setItem('rd_user', JSON.stringify(state.user));
  else localStorage.removeItem('rd_user');
}

export function afterLogin(user) {
  state.user = user;
  localStorage.setItem('rd_user', JSON.stringify(user));
  const next = sessionStorage.getItem('rd_after_login');
  sessionStorage.removeItem('rd_after_login');
  go(next || ({ productor: '#/productor', admin: '#/admin', transportista: '#/transportista' }[user.role] || '#/ofertas'));
  pollNotifications();
}

window.addEventListener('hashchange', router);
window.addEventListener('online', () => document.body.classList.remove('offline'));
window.addEventListener('offline', () => document.body.classList.add('offline'));
setInterval(tickTimers, 1000);
setInterval(pollNotifications, 30000);

// Sin top-level await: las vistas importan este módulo y deben poder resolverlo de inmediato.
(async () => {
  await refreshUser();
  await router();
  pollNotifications();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
