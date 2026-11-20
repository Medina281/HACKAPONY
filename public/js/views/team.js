// "Mi transporte": el productor da de alta a su propio personal de reparto y ve sus entregas a domicilio.
import { api } from '../api.js';
import { $, e, kg, toast, fieldErrors, fmtDate, mxn } from '../ui.js';
import { onLeave } from '../app.js';
import { loadLeaflet, addTiles } from './map.js';

const I = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${n}"/></svg>`;
const ST = { abierta: ['Por asignar', 'warn'], asignada: ['Asignada', 'info'], recogida: ['En camino', 'info'] };

export default async function team({ app }) {
  const [{ drivers, team_code: code, tariff }, { deliveries }, { fleet }] = await Promise.all([api('/api/producer/drivers'), api('/api/deliveries'), api('/api/producer/fleet')]);
  const active = drivers.filter((d) => d.active);
  app.innerHTML = `
  <div class="wrap page stack" style="max-width:760px">
    <p><a href="#/productor">← Inicio</a></p>
    <div><span class="mono-tag">Mi transporte</span><h1 style="margin:6px 0 0">Entregas y transportistas</h1>
      <p class="muted" style="margin:4px 0 0">Tus transportistas son tu personal: sólo ven las entregas que tú les asignas.</p></div>

    <form class="card stack" id="tariff" novalidate>
      <div class="row between"><h2 style="margin:0">${I('truck')} Tu tarifa de envío</h2>${tariff ? `<span class="pill ok">${mxn(tariff.base_c)} + ${mxn(tariff.per_km_c)}/km</span>` : '<span class="pill warn">sin tarifa</span>'}</div>
      <p class="small muted" style="margin:0">Con ella la app le calcula al comercio el costo de envío antes de apartar (distancia estimada por carretera desde tu municipio). El comercio no la puede cambiar.</p>
      <div class="two">
        <div class="field"><label for="base">Cargo base</label><div class="input-unit"><input id="base" name="base" inputmode="decimal" value="${tariff ? tariff.base_c / 100 : ''}" placeholder="25"><span>pesos</span></div><div class="err" data-for="base"></div></div>
        <div class="field"><label for="per_km">Por kilómetro</label><div class="input-unit"><input id="per_km" name="per_km" inputmode="decimal" value="${tariff ? tariff.per_km_c / 100 : ''}" placeholder="4"><span>$/km</span></div><div class="err" data-for="per_km"></div></div>
      </div>
      <div class="small" id="tariffEx"></div>
      <button class="btn secondary">Guardar tarifa</button>
    </form>

    <div class="card stack" id="fleetCard">
      <div class="row between"><h2 style="margin:0">${I('truck')} Mis transportistas en ruta</h2><span class="pill info" id="fleetCount"></span></div>
      <div id="fleetMap" style="height:300px;border-radius:18px;overflow:hidden;background:#eef5f0"></div>
      <div id="fleetList" class="stack"></div>
    </div>

    <h2>Entregas a domicilio en curso</h2>
    ${deliveries.length ? deliveries.map((d) => `
      <a class="card row" href="${d.status === 'recogida' ? `#/seguimiento/${d.id}` : `#/pedido/${e(d.folio)}`}" style="text-decoration:none;color:inherit;flex-wrap:nowrap;gap:12px">
        <div class="grow" style="min-width:0"><div class="row between"><strong>${e(d.product)} · ${kg(d.weight_g)}</strong><span class="pill ${ST[d.status]?.[1] || 'muted'}">${ST[d.status]?.[0] || e(d.status)}</span></div>
          <div class="small muted">${e(d.buyer?.name || '')} · ${e(d.to_name)} · ${fmtDate(d.pickup_at)}</div>
          <div class="small">${d.carrier ? `${I('user')} ${e(d.carrier.name)}` : `${I('alert')} <b>Falta asignar quién lo lleva</b>`} · envío ${mxn(d.fee_c || 0)}</div></div>
        <span class="btn sm secondary" style="flex:none">${d.status === 'abierta' ? 'Asignar' : d.status === 'recogida' ? 'Seguir' : 'Ver'}</span>
      </a>`).join('') : '<p class="muted">No hay entregas a domicilio pendientes. Aparecen aquí cuando un comercio pide que se lo lleves.</p>'}

    <h2>Mis transportistas</h2>
    ${drivers.length ? drivers.map((d) => `
      <div class="card row" style="flex-wrap:nowrap;gap:12px;${d.active ? '' : 'opacity:.6'}">
        <div class="grow" style="min-width:0"><strong>${e(d.name)}</strong>${d.active ? '' : ' <span class="pill muted">de baja</span>'}
          <div class="small muted">${I('phone')} ${e(d.phone)} · ${I('truck')} ${e(d.vehicle || '')}${d.capacity_kg ? ` · ${d.capacity_kg} kg` : ''}${d.refrigerated ? ` · ${I('snow')}` : ''}</div>
          <div class="small">${d.active_trips} pendientes · ${d.delivered} entregadas</div></div>
        <button class="btn sm ${d.active ? 'ghost' : 'secondary'}" data-toggle="${d.id}" data-on="${d.active ? 0 : 1}" style="flex:none">${d.active ? 'Dar de baja' : 'Reactivar'}</button>
      </div>`).join('') : '<p class="muted">Aún no registras a nadie.</p>'}

    <div class="card stack">
      <strong>Código de tu equipo</strong>
      <div class="row between"><span class="code" style="font-size:1.8rem;margin:0">${e(code)}</span><button type="button" class="btn ghost sm" id="newCode">Cambiar código</button></div>
      <p class="small muted" style="margin:0">Tu transportista crea su propia cuenta en “Crear cuenta → Transporto” y escribe este código. Así entra con su teléfono y contraseña y sólo ve tus entregas.</p>
    </div>

    <details class="card" ${active.length ? '' : 'open'}><summary><strong>${I('plus')} O regístralo tú</strong></summary>
      <form id="add" class="stack" novalidate style="margin-top:10px">
        <div class="field"><label for="name">Nombre</label><input id="name" name="name" required><div class="err" data-for="name"></div></div>
        <div class="field"><label for="phone">Teléfono (con él entra a la app)</label><input id="phone" name="phone" inputmode="tel" placeholder="10 dígitos"><div class="err" data-for="phone"></div></div>
        <div class="two">
          <div class="field"><label for="vehicle">Vehículo</label><input id="vehicle" name="vehicle" placeholder="Ej. Camioneta 3.5 t"></div>
          <div class="field"><label for="capacity_kg">Carga máxima</label><div class="input-unit"><input id="capacity_kg" name="capacity_kg" inputmode="numeric" placeholder="1500"><span>kg</span></div><div class="err" data-for="capacity_kg"></div></div>
        </div>
        <label class="inline-check"><input type="checkbox" name="refrigerated"><span>Tiene refrigeración</span></label>
        <div class="field"><label for="password">Contraseña para su cuenta</label><input id="password" name="password" type="text" autocomplete="off" minlength="8"><div class="hint">Mínimo 8 caracteres. Dásela en persona; podrá entrar con su teléfono y esta contraseña.</div><div class="err" data-for="password"></div></div>
        <button class="btn">${I('plus')} Agregar</button>
      </form>
    </details>
  </div>`;

  $('#newCode').addEventListener('click', async () => {
    if (!confirm('¿Cambiar el código? El anterior dejará de servir para registrarse.')) return;
    await api('/api/producer/team-code', { method: 'POST' });
    team({ app });
  });

  // ---------- Flota en vivo ----------
  let L = null;
  let map = null;
  const layers = new Map();
  const clock = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  function paintFleet(list) {
    const moving = list.filter((x) => x.position);
    $('#fleetCount').textContent = `${list.filter((x) => x.status === 'recogida').length} en camino`;
    $('#fleetList').innerHTML = list.length ? list.map((x) => `<a class="row between" href="#/seguimiento/${x.id}" style="text-decoration:none;color:inherit;border-top:1px solid var(--line);padding-top:8px">
        <span class="small"><b>${e(x.carrier?.name || 'Sin asignar')}</b> · ${e(x.product)} ${kg(x.weight_g)} → ${e(x.buyer || '')}<br><span class="muted">${x.status === 'recogida' ? (x.position ? `~${x.eta_min} min · llega ${clock(x.eta_at)} · ${x.remaining_km} km` : 'en camino, sin ubicación todavía') : 'por cargar'}</span></span>
        <span class="pill ${x.position ? (x.position.stale ? 'warn' : 'info') : 'muted'}">${x.position ? (x.position.stale ? 'sin señal' : 'en vivo') : x.status === 'recogida' ? 'sin GPS' : 'en espera'}</span></a>`).join('')
      : '<p class="small muted" style="margin:0">Nadie va en camino ahora. Cuando tu transportista toque “Ya cargué”, aparece aquí en el mapa.</p>';
    if (!map) return;
    const seen = new Set();
    for (const x of moving) {
      seen.add(x.id);
      const ll = [x.position.lat, x.position.lng];
      if (!layers.has(x.id)) {
        const m = L.marker(ll, { icon: L.divIcon({ className: '', html: `<div class="map-pin truck">${I('truck')}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] }) }).addTo(map).bindTooltip(`${e(x.carrier?.name || '')} → ${e(x.buyer || '')}`);
        const d = L.marker([x.dest.lat, x.dest.lng], { icon: L.divIcon({ className: '', html: `<div class="map-pin dest">${I('flag')}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] }) }).addTo(map).bindTooltip(e(x.buyer || ''));
        const line = L.polyline([ll, [x.dest.lat, x.dest.lng]], { color: '#1E9566', weight: 3, dashArray: '6 8' }).addTo(map);
        layers.set(x.id, { m, d, line });
      } else {
        const g = layers.get(x.id);
        g.m.setLatLng(ll);
        g.line.setLatLngs([ll, [x.dest.lat, x.dest.lng]]);
      }
    }
    for (const [id, g] of layers) if (!seen.has(id)) { map.removeLayer(g.m); map.removeLayer(g.d); map.removeLayer(g.line); layers.delete(id); }
    const pts = moving.flatMap((x) => [[x.position.lat, x.position.lng], [x.dest.lat, x.dest.lng]]);
    if (pts.length && !map._fitted) { map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); map._fitted = true; }
  }
  try {
    L = await loadLeaflet();
    const home = fleet[0]?.from || { lat: 19.7, lng: -101.19 };
    map = L.map('fleetMap', { scrollWheelZoom: false }).setView([home.lat, home.lng], 10);
    addTiles(L, map, 17);
  } catch {
    $('#fleetMap').innerHTML = '<p class="muted" style="padding:16px">No se pudo cargar el mapa; la lista de abajo sí se actualiza.</p>';
  }
  paintFleet(fleet);
  const poll = setInterval(async () => {
    if (document.hidden) return;
    try { paintFleet((await api('/api/producer/fleet')).fleet); } catch { /* siguiente ciclo */ }
  }, 8000);
  onLeave(() => clearInterval(poll));

  const ex = () => {
    const b = Number($('#base').value) || 0, k = Number($('#per_km').value) || 0;
    $('#tariffEx').textContent = `Ejemplo: a 10 km cobrarías ${mxn(Math.round((b + k * 10)) * 100)}; a 25 km, ${mxn(Math.round((b + k * 25)) * 100)}.`;
  };
  ex();
  $('#tariff').addEventListener('input', ex);
  $('#tariff').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api('/api/producer/delivery-tariff', { method: 'POST', body: { base: $('#base').value, per_km: $('#per_km').value } });
      toast('Tarifa de envío guardada', 'ok');
      team({ app });
    } catch (err) { fieldErrors(ev.target, err.fields); toast(err.message, 'error'); }
  });
  $('#add').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const body = Object.fromEntries(new FormData(f));
    body.refrigerated = !!f.refrigerated.checked;
    try {
      await api('/api/producer/drivers', { method: 'POST', body });
      toast(`${body.name} ya puede entrar con su teléfono`, 'ok');
      team({ app });
    } catch (err) {
      fieldErrors(f, err.fields);
      toast(Object.values(err.fields || {})[0] || err.message, 'error');
    }
  });
  app.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/api/producer/drivers/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.on === '1' } });
      team({ app });
    } catch (err) {
      toast(err.message, 'error');
    }
  }));
}
