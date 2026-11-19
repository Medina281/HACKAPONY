import { api } from '../api.js';
import { onLeave } from '../app.js';
import { $, $$, e, muniOptions, empty, errorBox, tickTimers } from '../ui.js';
import { CATEGORIES } from '../shared/catalog.js';
import { lotCard, refNote } from './components.js';

const KEY = 'rd_filters';

export default async function market({ app, state }) {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  const f = { q: '', category: '', municipality: '', from: state.user?.municipality || 'morelia', radius: '', sort: 'urgencia', max_price: '', urgent: '', closed: '1', ...saved };

  app.innerHTML = `
  <div class="wrap page stack">
    <div class="row between">
      <div><h1 style="margin:0">Ofertas de rescate</h1><p class="muted" style="margin:0">Primero lo más urgente. Precios por kilo.</p></div>
      <a class="btn ghost sm" href="#/mapa">🗺️ Ver mapa</a>
    </div>
    <form id="filters" class="filters" role="search">
      <div class="full"><label class="sr" for="q">Buscar</label><input id="q" name="q" type="search" placeholder="🔎 Buscar: jitomate, aguacate…" value="${e(f.q)}"></div>
      <div><label class="small" for="from">Estoy en</label><select id="from" name="from">${muniOptions(f.from)}</select></div>
      <div><label class="small" for="radius">Distancia</label><select id="radius" name="radius">
        ${[['', 'Cualquiera'], ['15', '≤ 15 km'], ['30', '≤ 30 km'], ['60', '≤ 60 km'], ['120', '≤ 120 km']].map(([v, l]) => `<option value="${v}" ${f.radius === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
      <div><label class="small" for="sort">Ordenar</label><select id="sort" name="sort">
        ${[['urgencia', 'Más urgente'], ['descuento', 'Mayor descuento'], ['precio', 'Menor precio'], ['distancia', 'Más cerca'], ['recientes', 'Más recientes']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
      <div><label class="small" for="max_price">Precio máx. /kg</label><input id="max_price" name="max_price" inputmode="decimal" placeholder="$" value="${e(f.max_price)}"></div>
    </form>
    <div class="chips" id="cats" role="group" aria-label="Categorías">
      <button class="chip ${!f.category ? 'on' : ''}" data-cat="">Todo</button>
      ${CATEGORIES.map((c) => `<button class="chip ${f.category === c.id ? 'on' : ''}" data-cat="${c.id}">${e(c.label)}</button>`).join('')}
      <button class="chip ${f.urgent === '1' ? 'on' : ''}" data-urgent>⏱ Por vencer</button>
      <button class="chip ${f.closed === '1' ? 'on' : ''}" data-closed>Ver agotadas/vencidas</button>
    </div>
    <div id="status" class="small muted" aria-live="polite"></div>
    <div id="list" class="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    ${refNote}
  </div>`;

  let timer;
  async function load() {
    localStorage.setItem(KEY, JSON.stringify(f));
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v != null));
    try {
      const data = await api(`/api/lots?${qs}`);
      const list = $('#list');
      if (!list) return;
      const open = data.lots.filter((l) => ['disponible', 'por_vencer'].includes(l.state)).length;
      $('#status').innerHTML = `${open} oferta${open === 1 ? '' : 's'} disponible${open === 1 ? '' : 's'}${data._stale ? ' · <strong>datos guardados sin conexión</strong>' : ''}`;
      list.innerHTML = data.lots.length
        ? data.lots.map((l) => lotCard(l, { owner: state.user && l.producer.id === state.user.id })).join('')
        : empty('🧺', 'No hay ofertas con esos filtros', 'Prueba con otra distancia o categoría. Las ofertas nuevas aparecen aquí en cuanto se publican.', '<button class="btn secondary" id="clear">Quitar filtros</button>');
      $('#clear')?.addEventListener('click', () => {
        Object.assign(f, { q: '', category: '', municipality: '', radius: '', max_price: '', urgent: '' });
        localStorage.setItem(KEY, JSON.stringify(f));
        market({ app, state });
      });
      tickTimers();
    } catch (err) {
      $('#list').innerHTML = errorBox(err, '<button class="btn" id="retry">Reintentar</button>');
      $('#retry')?.addEventListener('click', load);
    }
  }

  const form = $('#filters');
  form.addEventListener('submit', (ev) => ev.preventDefault());
  form.addEventListener('input', (ev) => {
    f[ev.target.name] = ev.target.value;
    clearTimeout(timer);
    timer = setTimeout(load, ev.target.name === 'q' || ev.target.name === 'max_price' ? 350 : 0);
  });
  $('#cats').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('cat' in b.dataset) {
      f.category = b.dataset.cat;
      $$('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
    } else if ('urgent' in b.dataset) {
      f.urgent = f.urgent === '1' ? '' : '1';
      b.classList.toggle('on');
    } else if ('closed' in b.dataset) {
      f.closed = f.closed === '1' ? '' : '1';
      b.classList.toggle('on');
    }
    load();
  });
  await load();
  const poll = setInterval(() => !document.hidden && load(), 30000); // datos frescos sin recargar
  onLeave(() => clearInterval(poll));
}
