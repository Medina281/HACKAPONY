// Panel del transportista: es personal del productor. Ve sólo las entregas que su productor le asigna.
import { api } from '../api.js';
import { state, onLeave } from '../app.js';
import { e, kg, empty, fmtDate, mxn } from '../ui.js';
import { municipality } from '../shared/catalog.js';

const STATUS = { asignada: ['Por cargar', 'warn'], recogida: ['En camino', 'info'], entregada: ['Entregado', 'done'], cancelada: ['Cancelado', 'muted'], abierta: ['Sin asignar', 'muted'] };
const pill = (s) => `<span class="pill ${STATUS[s]?.[1] || 'muted'}">${STATUS[s]?.[0] || e(s)}</span>`;
const I = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${n}"/></svg>`;

export default async function carrier({ app, query }) {
  const tab = query.tab === 'historial' ? 'historial' : 'hoy';
  const [{ summary: s, employer }, { deliveries }] = await Promise.all([api('/api/carrier/summary'), api('/api/deliveries')]);
  const u = state.user;
  const list = deliveries.filter((d) => (tab === 'hoy' ? ['asignada', 'recogida'].includes(d.status) : ['entregada', 'cancelada'].includes(d.status)));

  const card = (d) => `
    <article class="card stack trip">
      <div class="row between"><strong>${d.status === 'asignada' ? '<span class="pill warn">Nuevo pedido</span> ' : ''}${e(d.product)} · ${kg(d.weight_g)}</strong>${pill(d.status)}</div>
      <div class="small"><b>${e(d.buyer?.name || '')}</b><br><span class="muted">${e(d.buyer?.address || '')} · ${e(d.to_name)}</span></div>
      <div class="route"><span>${I('pin')} ${e(d.from_name)}</span><span class="muted">→ ${d.distance_km} km →</span><span>${I('flag')} ${e(d.to_name)}</span></div>
      ${d.status !== 'cancelada' ? `<div class="small">Cobrar al entregar: <b>${mxn((d.total_rescue_c || 0) + (d.fee_c || 0))}</b> <span class="muted">(producto ${mxn(d.total_rescue_c || 0)} + envío ${mxn(d.fee_c || 0)})</span></div>` : ''}
      <div class="small muted">Entregar: ${fmtDate(d.pickup_at)}${d.order_status === 'apartado' ? ' · <b>esperando que tu productor confirme</b>' : ''}</div>
      ${d.needs_cold ? `<span class="pill info">${I('snow')} Requiere refrigeración</span>` : ''}
      <a class="btn ${d.status === 'entregada' || d.status === 'cancelada' ? 'ghost' : 'big'} block" href="#/entrega/${d.id}">${d.status === 'asignada' ? `${I('truck')} Ver y cargar` : d.status === 'recogida' ? `${I('check-circle')} Entregar` : 'Ver detalle'}</a>
    </article>`;

  app.innerHTML = `
  <div class="wrap page stack">
    <div>
      <span class="mono-tag">Transportista</span>
      <h1 style="margin:6px 0 0">Hola, ${e(u.name.split(' ')[0])}</h1>
      ${employer ? `<p class="muted" style="margin:4px 0 0">Entregas de <b>${e(employer.name)}</b> · ${e(municipality(employer.municipality)?.name || '')}</p>` : '<p class="muted">Aún no estás ligado a un productor.</p>'}
    </div>
    <div class="kpis">
      <div class="kpi main"><b>${s.active}</b><span>entregas pendientes</span></div>
      <div class="kpi"><b>${s.delivered}</b><span>entregadas</span></div>
      <div class="kpi"><b>${kg(s.moved_g)}</b><span>de alimento movido</span></div>
    </div>
    <div class="small muted">${I('truck')} ${e(u.vehicle || 'Vehículo')}${u.capacity_kg ? ` · ${u.capacity_kg} kg` : ''}${u.refrigerated ? ` · ${I('snow')} refrigerado` : ''} · <a href="#/perfil">cambiar</a></div>
    <div class="tabs">
      <a class="chip ${tab === 'hoy' ? 'on' : ''}" href="#/transportista" style="text-decoration:none">${I('truck')} Por entregar</a>
      <a class="chip ${tab === 'historial' ? 'on' : ''}" href="#/transportista?tab=historial" style="text-decoration:none">${I('navigation')} Historial</a>
    </div>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>`
      : empty(I('truck'), tab === 'hoy' ? 'No tienes entregas pendientes' : 'Aún no hay entregas terminadas', tab === 'hoy' ? `Cuando ${employer ? e(employer.name) : 'tu productor'} te asigne un pedido, aparecerá aquí y te avisamos con la campanita.` : '')}
  </div>`;

  const poll = setInterval(() => !document.hidden && tab === 'hoy' && carrier({ app, query }), 30000);
  onLeave(() => clearInterval(poll));
}
