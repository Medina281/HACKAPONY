// Panel del transportista: viajes disponibles cerca, tomar un flete con un toque, mis viajes y ganancias.
import { api } from '../api.js';
import { state, onLeave } from '../app.js';
import { $, e, mxn, kg, toast, empty, fmtDate } from '../ui.js';

const STATUS = { abierta: ['Disponible', 'ok'], asignada: ['Por recoger', 'warn'], recogida: ['En camino', 'info'], entregada: ['Entregado', 'done'], cancelada: ['Cancelado', 'muted'] };
const pill = (s) => `<span class="pill ${STATUS[s]?.[1] || 'muted'}">${STATUS[s]?.[0] || e(s)}</span>`;

export default async function carrier({ app, query }) {
  const tab = query.tab === 'mios' ? 'mios' : 'disponibles';
  const all = query.all === '1';
  const [{ summary: s }, { deliveries }] = await Promise.all([
    api('/api/carrier/summary'),
    api(`/api/deliveries?scope=${tab === 'mios' ? 'mine' : 'open'}${all ? '&all=1' : ''}`),
  ]);
  const u = state.user;

  const tripCard = (d) => `
    <article class="card stack trip ${tab === 'mios' ? 'mine' : ''}">
      <div class="row between"><strong>${e(d.product)} · ${kg(d.weight_g)}</strong>${pill(d.status)}</div>
      <div class="route"><span><svg class="i" aria-hidden="true"><use href="/icons.svg#pin"/></svg> ${e(d.from_name)}</span><span class="muted">→ ${d.distance_km} km →</span><span><svg class="i" aria-hidden="true"><use href="/icons.svg#flag"/></svg> ${e(d.to_name)}</span></div>
      <div class="row between">
        <span class="price" style="font-size:1.5rem">${mxn(d.fee_c)}</span>
        <span class="small muted">${d.distance_to_pickup_km != null ? `a ${d.distance_to_pickup_km} km de ti · ` : ''}recoger ${fmtDate(d.pickup_at)}</span>
      </div>
      ${d.needs_cold ? '<span class="pill info"><svg class="i" aria-hidden="true"><use href="/icons.svg#snow"/></svg> Requiere refrigeración</span>' : ''}
      ${d.fits === false ? '<span class="pill danger">No cabe en tu vehículo o requiere frío</span>' : ''}
      ${d.notes ? `<p class="small muted" style="margin:0">“${e(d.notes)}”</p>` : ''}
      ${d.status === 'abierta'
        ? `<button class="btn big" data-take="${d.id}" ${d.fits === false ? 'disabled' : ''}><svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> Tomar viaje</button>`
        : `<a class="btn ${d.status === 'entregada' ? 'ghost' : ''} block" href="#/flete/${d.id}">${d.status === 'asignada' ? 'Ir a recoger' : d.status === 'recogida' ? 'Entregar' : 'Ver detalle'}</a>`}
    </article>`;

  app.innerHTML = `
  <div class="wrap page stack">
    <div class="row between">
      <div><span class="mono-tag">Transportista</span><h1 style="margin:6px 0 0">Hola, ${e(u.name.split(' ')[0])}</h1></div>
      <label class="toggle"><input type="checkbox" id="avail" ${u.available ? 'checked' : ''}> ${u.available ? 'Disponible' : 'No disponible'}</label>
    </div>
    <div class="kpis">
      <div class="kpi main"><b>${mxn(s.earnings_c)}</b><span>ganado en fletes entregados</span></div>
      <div class="kpi"><b>${s.active}</b><span>viajes activos</span></div>
      <div class="kpi"><b>${s.delivered}</b><span>entregas</span></div>
      <div class="kpi"><b>${kg(s.moved_g)}</b><span>de alimento movido</span></div>
    </div>
    <div class="small muted"><svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> ${e(u.vehicle || 'Vehículo')} · ${u.capacity_kg} kg${u.refrigerated ? ' · <svg class="i" aria-hidden="true"><use href="/icons.svg#snow"/></svg> refrigerado' : ''} · radio ${u.radius_km} km · <a href="#/perfil">cambiar</a></div>
    <div class="tabs">
      <a class="chip ${tab === 'disponibles' ? 'on' : ''}" href="#/transportista" style="text-decoration:none"><svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> Disponibles</a>
      <a class="chip ${tab === 'mios' ? 'on' : ''}" href="#/transportista?tab=mios" style="text-decoration:none"><svg class="i" aria-hidden="true"><use href="/icons.svg#navigation"/></svg> Mis viajes</a>
      ${tab === 'disponibles' ? `<a class="chip ${all ? 'on' : ''}" href="#/transportista${all ? '' : '?all=1'}" style="text-decoration:none">${all ? 'Sólo los que me quedan' : 'Ver todos'}</a>` : ''}
    </div>
    ${deliveries.length ? `<div class="grid">${deliveries.map(tripCard).join('')}</div>`
      : empty(tab === 'mios' ? '<svg class="i" aria-hidden="true"><use href="/icons.svg#navigation"/></svg>' : '<svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg>', tab === 'mios' ? 'Aún no tienes viajes' : 'No hay fletes cerca por ahora', tab === 'mios' ? 'Toma un viaje disponible y aparecerá aquí.' : 'Te avisamos con la campanita <svg class="i" aria-hidden="true"><use href="/icons.svg#bell"/></svg> cuando un comercio pida traslado en tu zona.')}
    <p class="tiny muted">Raíz Directa conecta a comercios con transportistas independientes; no presta el servicio de transporte. El pago del flete se acuerda directo con el comercio.</p>
  </div>`;

  $('#avail').addEventListener('change', async (ev) => {
    try {
      const { user } = await api('/api/me', { method: 'PATCH', body: { available: ev.target.checked } });
      state.user = user;
      ev.target.parentElement.lastChild.textContent = user.available ? ' Disponible' : ' No disponible';
      toast(user.available ? 'Ahora recibes avisos de viajes' : 'Ya no recibirás avisos de viajes', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  app.onclick = async (ev) => {
    const b = ev.target.closest('[data-take]');
    if (!b) return;
    b.disabled = true;
    b.textContent = 'Tomando…';
    try {
      const { delivery } = await api(`/api/deliveries/${b.dataset.take}/accept`, { method: 'POST' });
      toast('¡Viaje tuyo! Pasa por el producto <svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg>', 'ok');
      location.hash = `#/flete/${delivery.id}`;
    } catch (err) {
      toast(err.message, 'error');
      carrier({ app, query });
    }
  };
  const poll = setInterval(() => !document.hidden && tab === 'disponibles' && carrier({ app, query }), 30000);
  onLeave(() => clearInterval(poll));
}
