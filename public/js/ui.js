import { serverNow } from './api.js';
import { formatRemaining, formatMXN, formatKg } from './shared/calc.js';
import { productIcon, productIconName, stockPhoto, MUNICIPALITIES, ORDER_STATUS, municipality, allStates, municipalitiesOf, setMunicipios, geoLoaded } from './shared/catalog.js';

/** Escapa texto para insertarlo en HTML (previene XSS). */
export const e = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export { formatMXN as mxn, formatKg as kg };

export const stripIcons = (s) => String(s).replace(/<svg[\s\S]*?<\/svg>\s*/g, '').trim();

export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = stripIcons(msg);
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstChild.remove(); // máximo 2 avisos a la vez
  box.append(el);
  setTimeout(() => el.remove(), 4200);
}

export const muniOptions = (selected, { any } = {}) =>
  (any ? `<option value="">${e(any)}</option>` : '') +
  (selected && !MUNICIPALITIES.some((m) => m.id === selected) && municipality(selected) ? `<option value="${e(selected)}" selected>${e(municipality(selected).name)}, ${e(municipality(selected).state)}</option>` : '') +
  [...new Set(MUNICIPALITIES.map((m) => m.state))].map((st) => `<optgroup label="${e(st)}">${MUNICIPALITIES.filter((m) => m.state === st).map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${e(m.name)}</option>`).join('')}</optgroup>`).join('');

// ---------- Estado → Municipio (catálogo real del INEGI) ----------
let geoPromise = null;
/** Carga una sola vez el catálogo de municipios del INEGI (≈110 KB, queda en caché). */
export function ensureGeo() {
  if (geoLoaded()) return Promise.resolve();
  geoPromise ||= fetch('/api/geo').then((r) => (r.ok ? r.json() : null)).then((d) => setMunicipios(d)).catch(() => {});
  return geoPromise;
}
const muniOpts = (state, selected) => municipalitiesOf(state).map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${e(m.name)}</option>`).join('');
/** Dos listas: primero el estado y luego sus municipios. Llama antes a ensureGeo(). */
export function muniPicker(name, selected, { label = 'Municipio' } = {}) {
  const m = municipality(selected) || municipality('morelia');
  return `<div class="two muni-picker" data-muni-picker>
    <div class="field" style="margin:0"><label for="${name}_estado">Estado</label><select id="${name}_estado" data-state>${allStates().map((s) => `<option ${s === m.state ? 'selected' : ''}>${e(s)}</option>`).join('')}</select></div>
    <div class="field" style="margin:0"><label for="${name}">${e(label)}</label><select id="${name}" name="${name}">${muniOpts(m.state, m.id)}</select><div class="err" data-for="${name}"></div></div>
  </div>`;
}
export function wireMuniPickers(root) {
  root.querySelectorAll('[data-muni-picker]').forEach((w) => {
    w.querySelector('[data-state]').addEventListener('change', (ev) => {
      const sel = w.querySelector('select[name]');
      sel.innerHTML = muniOpts(ev.target.value);
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

/** Foto del productor; si no hay, foto real de referencia (Commons) etiquetada; sin red, ícono. */
export function media(photo, product, cls = '') {
  if (photo) return `<img src="${e(photo)}" alt="Foto de ${e(product)}" loading="lazy" decoding="async" class="${cls}">`;
  const s = stockPhoto(product);
  if (s) return `<img src="${e(s.url)}" alt="${e(product)} (foto de referencia)" loading="lazy" decoding="async" data-fallback="${productIconName(product)}" class="${cls}"><span class="ref-tag">referencia</span>`;
  return `<span class="prod-tile" aria-hidden="true">${productIcon(product)}</span>`;
}

// Si una foto de referencia no carga (sin internet), se reemplaza por el ícono del producto.
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (img instanceof HTMLImageElement && img.dataset.fallback) {
    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.className = 'prod-tile';
    span.innerHTML = `<svg class="i prod"><use href="/icons.svg#${img.dataset.fallback.replace(/[^a-z-]/g, '')}"/></svg>`;
    img.nextElementSibling?.classList.contains('ref-tag') && img.nextElementSibling.remove();
    img.replaceWith(span);
  }
}, true);

export const STATE_LABEL = {
  disponible: ['Disponible', 'ok'],
  por_vencer: ['Por vencer', 'warn'],
  agotado: ['Agotado', 'muted'],
  vencido: ['Vencido', 'danger'],
  pausado: ['Pausado', 'muted'],
  retirado: ['Retirado', 'muted'],
};
export const statePill = (s) => {
  const [label, tone] = STATE_LABEL[s] || [s, 'muted'];
  return `<span class="pill ${tone}">${e(label)}</span>`;
};
export const orderPill = (s) => {
  const st = ORDER_STATUS[s] || { label: s, tone: 'muted' };
  return `<span class="pill ${st.tone}">${e(st.label)}</span>`;
};

/** Temporizador: se calcula desde la fecha de vencimiento persistida y la hora del servidor. */
export const timer = (expiresAt) => `<span class="timer" data-expires="${expiresAt}">--:--:--</span>`;

const fmtElapsed = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

/** Análisis de vida útil en vivo: tiempo transcurrido desde la publicación y fase. */
export function shelfAnalysis(l) {
  const s = l.shelf;
  return `<div class="card stack shelf-card" data-life-from="${l.created_at}" data-life-to="${l.expires_at}">
    <div class="row between"><h3 style="margin:0"><svg class="i" aria-hidden="true"><use href="/icons.svg#leaf"/></svg> Vida útil</h3><span class="pill" data-life-phase>…</span></div>
    <div class="bar" aria-hidden="true"><i data-life-bar style="width:0%"></i></div>
    <dl class="kv small">
      <dt>Publicado hace</dt><dd data-life-elapsed>…</dd>
      <dt>Frescura declarada</dt><dd>${l.fresh_hours} h (por el productor)</dd>
      ${s ? `<dt>Estimación por clima</dt><dd>~${s.hours} h <span class="muted">(rango ${s.low}–${s.high} h; ${s.source === 'open-meteo' ? `promedio previsto ${s.temp_mean} °C, máx. ${s.temp_max} °C` : `clima indicado por el productor, ~${s.temp_mean} °C`})</span></dd>` : '<dt>Estimación por clima</dt><dd class="muted">No se registró al publicar</dd>'}
    </dl>
    ${s && l.fresh_hours > s.high ? '<div class="notice small">La frescura declarada es mayor que la estimada para el clima de ese día. Revisa el producto al recogerlo.</div>' : ''}
    <p class="tiny muted" style="margin:0">Estimación orientativa al momento de publicar; no certifica inocuidad.${s?.source === 'open-meteo' ? ' Clima: Open-Meteo.com (CC BY 4.0).' : ''}</p>
  </div>`;
}
const PHASES = [[1, 'Ventana terminada', 'danger'], [0.8, 'Último momento', 'warn'], [0.5, 'Usar pronto', 'info'], [0, 'Fresco', 'ok']];

export function tickTimers() {
  const now = serverNow();
  for (const el of $$('[data-life-from]')) {
    const from = Number(el.dataset.lifeFrom);
    const to = Number(el.dataset.lifeTo);
    const used = Math.min(1, Math.max(0, (now - from) / (to - from)));
    const [, label, tone] = PHASES.find(([min]) => used >= min);
    const pill = $('[data-life-phase]', el);
    pill.textContent = `${label} · ${Math.round(used * 100)}%`;
    pill.className = `pill ${tone}`;
    $('[data-life-bar]', el).style.width = `${Math.round(used * 100)}%`;
    $('[data-life-elapsed]', el).textContent = fmtElapsed(now - from);
  }
  for (const el of $$('[data-expires]')) {
    const left = Number(el.dataset.expires) - now;
    el.textContent = formatRemaining(left);
    el.classList.toggle('hot', left > 0 && left < 6 * 3600e3);
    el.classList.toggle('dead', left <= 0);
    if (left <= 0) {
      // Una vista vieja no permite apartar: se deshabilita el botón al llegar a cero (el servidor también lo rechaza).
      const card = el.closest('[data-lot]');
      if (card && !card.classList.contains('closed')) {
        card.classList.add('closed');
        for (const b of $$('[data-needs-open]', card)) {
          b.disabled = true;
          b.textContent = 'Vencido';
          b.removeAttribute('href');
        }
      }
    }
  }
}

export const fmtDate = (ms, opts = {}) =>
  new Date(ms).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...opts });

// ---- WhatsApp: enlaces wa.me con texto prellenado (no es WhatsApp Business API) ----
export const waLink = (phone, text) =>
  `https://wa.me/${phone ? '52' + String(phone).replace(/\D/g, '').slice(-10) : ''}?text=${encodeURIComponent(text)}`;
export const shareText = (l) =>
  `Oferta en Raíz Directa: ${formatKg(l.available_g)} de ${l.product} a ${formatMXN(l.rescue_price_c)}/kg ` +
  `(${l.discount}% menos que el precio del productor). Zona: ${l.municipality_name}. ${location.origin}/#/oferta/${l.id}`;

export function fieldErrors(form, fields = {}) {
  for (const el of $$('.field', form)) el.classList.remove('invalid');
  for (const el of $$('.err[data-for]', form)) el.textContent = '';
  let first = null;
  for (const [k, msg] of Object.entries(fields)) {
    const box = $(`.err[data-for="${k}"]`, form);
    if (box) {
      box.textContent = msg;
      box.closest('.field')?.classList.add('invalid');
      first = first || box.closest('.field');
    }
  }
  first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export const empty = (icon, title, text, action = '') =>
  `<div class="empty"><div class="big" aria-hidden="true">${icon}</div><h3>${e(title)}</h3><p>${e(text)}</p>${action}</div>`;

export const errorBox = (err, retry = '') =>
  `<div class="empty"><div class="big" aria-hidden="true"><svg class="i" aria-hidden="true"><use href="/icons.svg#alert"/></svg></div><h3>No pudimos cargar esto</h3><p>${e(err.message)}</p>${retry}</div>`;

/** Redimensiona una foto en el teléfono antes de subirla (ahorra datos móviles). */
export function shrinkImage(file, max = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

/** Ícono de línea del sprite /icons.svg (sin emojis). */
export const I = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true" focusable="false"><use href="/icons.svg#${name}"/></svg>`;
