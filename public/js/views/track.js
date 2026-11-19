// Seguimiento en vivo de una entrega: dónde va el camión y en cuánto llega (estimado).
import { api } from '../api.js';
import { onLeave } from '../app.js';
import { $, e, kg, fmtDate, waLink } from '../ui.js';
import { loadLeaflet, addTiles } from './map.js';

const I = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${n}"/></svg>`;
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`; };
const clock = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

export default async function track({ app, params, state }) {
  let t = (await api(`/api/deliveries/${params.id}/track`)).track;
  const back = state.user.role === 'transportista' ? `#/entrega/${t.id}` : `#/pedido/${e(t.folio)}`;
  app.innerHTML = `
  <div class="wrap page stack" style="max-width:760px">
    <p><a href="${back}">← Volver</a></p>
    <div><span class="mono-tag">Seguimiento · ${e(t.folio)}</span><h1 style="margin:6px 0 0">${e(t.product)} · ${kg(t.weight_g)}</h1>
      <p class="muted" style="margin:4px 0 0">${e(t.producer || '')} → ${e(t.buyer || '')}</p></div>
    <div class="card stack" id="status" aria-live="polite"></div>
    <div id="tmap" style="height:380px;border-radius:22px;overflow:hidden;background:#eef5f0"></div>
    <p class="tiny muted">Tiempo estimado: distancia en línea recta × ${t.road_factor} (rodeo de carretera) a ${t.avg_kmh} km/h promedio. Es una aproximación, no una ruta de navegación. ${t.dest.exact ? 'El destino es la ubicación que marcó el comercio.' : 'Como el comercio no marcó su ubicación exacta, se usa el centro del municipio.'}</p>
  </div>`;

  let L = null;
  let map = null;
  let truck = null;
  let line = null;
  try {
    L = await loadLeaflet();
    map = L.map('tmap', { scrollWheelZoom: false });
    addTiles(L, map, 17);
    L.circleMarker([t.from.lat, t.from.lng], { radius: 7, color: '#0F4D3A', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(map).bindTooltip(`Sale de ${e(t.from.name)}`);
    L.marker([t.dest.lat, t.dest.lng], { icon: L.divIcon({ className: '', html: `<div class="map-pin dest">${I('flag')}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] }) }).addTo(map).bindTooltip(`Entrega: ${e(t.dest.address || t.dest.name)}`);
    map.fitBounds([[t.from.lat, t.from.lng], [t.dest.lat, t.dest.lng]], { padding: [40, 40] });
  } catch {
    $('#tmap').innerHTML = '<p class="muted" style="padding:16px">No se pudo cargar el mapa; el tiempo estimado sigue actualizándose.</p>';
  }

  function render() {
    const box = $('#status');
    if (!box) return;
    const c = t.carrier;
    let html;
    if (t.status === 'entregada') html = `<div class="row between"><strong>${I('check-circle')} Entregado</strong><span class="pill done">${fmtDate(t.delivered_at)}</span></div>`;
    else if (t.status === 'cancelada') html = '<strong>La entrega se canceló.</strong>';
    else if (t.status !== 'recogida') html = `<strong>${I('clock')} Aún no sale</strong><p class="small muted" style="margin:0">${c ? `${e(c.name)} todavía no carga el pedido.` : 'El productor aún no asigna quién lo lleva.'} El seguimiento empieza cuando va en camino.</p>`;
    else if (!t.position) html = `<strong>${I('truck')} En camino</strong><p class="small muted" style="margin:0">${e(c?.name || 'El transportista')} salió ${t.picked_at ? `a las ${clock(t.picked_at)}` : ''}, pero aún no comparte su ubicación.</p>`;
    else html = `<div class="row between"><strong>${I('truck')} En camino</strong><span class="pill ${t.position.stale ? 'warn' : 'info'}">${t.position.stale ? 'sin señal reciente' : 'en vivo'}</span></div>
      <div class="kpis" style="margin:4px 0"><div class="kpi main"><b>~${t.eta_min} min</b><span>llega cerca de las ${clock(t.eta_at)}</span></div><div class="kpi"><b>${t.remaining_km} km</b><span>faltan (aprox.)</span></div></div>
      <div class="small muted">Ubicación ${ago(t.position.at)}${t.position.acc ? ` · precisión ±${Math.round(t.position.acc)} m` : ''}</div>`;
    if (c && ['asignada', 'recogida'].includes(t.status) && state.user.role !== 'transportista') html += `<a class="btn wa sm" target="_blank" rel="noopener" href="${waLink(c.phone, `Hola, sobre el pedido ${t.folio}.`)}">${I('chat')} WhatsApp a ${e(c.name.split(' ')[0])}</a>`;
    box.innerHTML = html;
    if (map && t.position) {
      const ll = [t.position.lat, t.position.lng];
      if (!truck) {
        truck = L.marker(ll, { icon: L.divIcon({ className: '', html: `<div class="map-pin truck">${I('truck')}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] }), zIndexOffset: 1000 }).addTo(map);
        line = L.polyline([ll, [t.dest.lat, t.dest.lng]], { color: '#1E9566', weight: 3, dashArray: '6 8' }).addTo(map);
        map.fitBounds([ll, [t.dest.lat, t.dest.lng]], { padding: [50, 50], maxZoom: 15 });
      } else {
        truck.setLatLng(ll);
        line.setLatLngs([ll, [t.dest.lat, t.dest.lng]]);
      }
    } else if (truck && !t.position) {
      map.removeLayer(truck);
      map.removeLayer(line);
      truck = null;
    }
  }
  render();
  const poll = setInterval(async () => {
    if (document.hidden || ['entregada', 'cancelada'].includes(t.status)) return;
    try {
      t = (await api(`/api/deliveries/${params.id}/track`)).track;
      render();
    } catch { /* se reintenta en el siguiente ciclo */ }
  }, 8000);
  const tick = setInterval(() => t.position && render(), 15000);
  onLeave(() => (clearInterval(poll), clearInterval(tick)));
}
