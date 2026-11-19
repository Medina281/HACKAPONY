import { api } from '../api.js';
import { $, e, mxn, kg } from '../ui.js';
import { municipality, productIcon } from '../shared/catalog.js';

// Leaflet + OpenStreetMap se cargan sólo en esta vista (ahorro de datos) y con verificación de integridad (SRI).
const LEAFLET_JS = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg=='];
const LEAFLET_CSS = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w=='];

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: LEAFLET_CSS[0], integrity: LEAFLET_CSS[1], crossOrigin: '' });
    document.head.append(css);
    const s = Object.assign(document.createElement('script'), { src: LEAFLET_JS[0], integrity: LEAFLET_JS[1], crossOrigin: '' });
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error('No se pudo cargar el mapa'));
    setTimeout(() => reject(new Error('El mapa tardó demasiado')), 8000);
    document.head.append(s);
  });
}

/** Teselas de OpenStreetMap (sin clave); si fallan varias, Esri World Street Map (también sin clave). */
export function addTiles(L, map, maxZoom = 15) {
  let fails = 0;
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom, attribution: '© colaboradores de OpenStreetMap' }).addTo(map);
  osm.on('tileerror', () => {
    if (++fails !== 4) return;
    map.removeLayer(osm);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom, attribution: 'Teselas © Esri — fuentes: Esri, HERE, Garmin, © colaboradores de OpenStreetMap',
    }).addTo(map);
  });
}

export default async function mapView({ app, state }) {
  const { lots } = await api('/api/lots');
  const byMuni = {};
  for (const l of lots) (byMuni[l.municipality] ||= []).push(l);
  const groups = Object.entries(byMuni).map(([id, ls]) => ({ m: municipality(id), lots: ls })).filter((g) => g.m).sort((a, b) => (a.m.region || '').localeCompare(b.m.region || '') || a.m.name.localeCompare(b.m.name));
  const home = municipality(state.user?.municipality || 'morelia');

  const listHtml = (g) => g.lots.map((l) => `<a href="#/oferta/${l.id}" style="display:block;padding:4px 0">${productIcon(l.product)} ${e(l.product)} · ${kg(l.available_g)} · <strong>${mxn(l.rescue_price_c)}/kg</strong></a>`).join('');

  app.innerHTML = `
  <div class="wrap page stack">
    <div class="row between"><h1 style="margin:0">Mapa de ofertas</h1><a class="btn ghost sm" href="#/ofertas">Ver lista</a></div>
    <p class="small muted">Los puntos marcan la <strong>cabecera municipal</strong>, no la ubicación del productor (protegemos su privacidad). El punto exacto se comparte al apartar.</p>
    <div id="map" role="region" aria-label="Mapa"></div>
    <div id="fallback" class="stack"></div>
  </div>`;

  try {
    const L = await loadLeaflet();
    const map = L.map('map', { scrollWheelZoom: false }).setView([home.lat, home.lng], 8);
    // Teselas de OpenStreetMap (gratuitas, sin clave; exigen atribución y que el navegador envíe el sitio de origen).
    // Si fallan varias, se cambia a Esri World Street Map (también sin clave).
    addTiles(L, map);
    L.circleMarker([home.lat, home.lng], { radius: 8, color: '#0F4D3A', fillColor: '#3FD39A', fillOpacity: 1, weight: 3 }).addTo(map).bindTooltip(`Tú: ${home.name}`);
    for (const g of groups) {
      const n = g.lots.length;
      L.marker([g.m.lat, g.m.lng], {
        icon: L.divIcon({ className: '', html: `<div style="background:#0F4D3A;color:#fff;border-radius:999px;padding:5px 12px;font-family:DM Sans,system-ui,sans-serif;font-weight:700;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25)">${e(g.m.name)} · ${n}</div>`, iconSize: null }),
      }).addTo(map).bindPopup(`<strong>${e(g.m.name)}</strong> <span style="color:#667">· región ${e(g.m.region || '')}</span><br>${listHtml(g)}`);
    }
    if (groups.length) map.fitBounds(groups.map((g) => [g.m.lat, g.m.lng]).concat([[home.lat, home.lng]]), { padding: [40, 40], maxZoom: 10 });
  } catch (err) {
    $('#map').innerHTML = `<div class="empty"><div class="big"><svg class="i" aria-hidden="true"><use href="/icons.svg#map"/></svg></div><p>${e(err.message)}. Te mostramos la lista por municipio (funciona sin mapa).</p></div>`;
    Object.assign($('#map').style, { height: 'auto', minHeight: '0' });
  }
  $('#fallback').innerHTML = groups.length
    ? groups.map((g) => `<div class="card"><h3><svg class="i" aria-hidden="true"><use href="/icons.svg#pin"/></svg> ${e(g.m.name)} <span class="pill">${g.lots.length}</span> <span class="tiny muted">región ${e(g.m.region || '')}</span></h3>${listHtml(g)}</div>`).join('')
    : '<p class="muted">No hay ofertas disponibles ahora.</p>';
}
