import { api } from '../api.js';
import { e, mxn, kg, orderPill, fmtDate, empty, media } from '../ui.js';

export default async function buyer({ app, state }) {
  const [{ summary: s }, { orders }] = await Promise.all([api('/api/buyer/summary'), api('/api/orders')]);
  const active = orders.filter((o) => ['apartado', 'confirmado', 'listo'].includes(o.status));
  const past = orders.filter((o) => !['apartado', 'confirmado', 'listo'].includes(o.status));
  const DS = { abierta: 'Entrega solicitada', asignada: 'Transportista asignado', recogida: 'En camino', entregada: 'Entregado a domicilio' };
  const enRuta = active.filter((o) => o.delivery_status === 'recogida');
  const row = (o) => `
    <div class="stack" style="gap:6px">
    <a class="card row" href="#/pedido/${e(o.folio)}" style="text-decoration:none;color:inherit;flex-wrap:nowrap">
      <div style="font-size:2rem;width:52px;height:52px;display:grid;place-items:center;background:var(--cream-2);border-radius:12px;overflow:hidden;flex:none">${media(o.photo, o.product)}</div>
      <div class="grow"><div class="row between"><strong>${e(o.folio)} · ${e(o.product)}</strong>${orderPill(o.status)}</div>
      <div class="small muted">${kg(o.qty_g)} · ${mxn(o.total_rescue_c)} · ahorro ${mxn(o.savings_c)} · ${e(o.producer.name)}</div>
      <div class="small"><svg class="i" aria-hidden="true"><use href="/icons.svg#clock"/></svg> ${fmtDate(o.pickup_at)}${o.delivery_status ? ` · <svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> ${DS[o.delivery_status] || ''}` : ''}</div></div>
    </a>
    ${o.delivery_status === 'recogida' ? `<a class="btn" href="#/seguimiento/${o.delivery_id}"><svg class="i" aria-hidden="true"><use href="/icons.svg#pin"/></svg> Ver dónde va mi pedido ${e(o.folio)}</a>` : ''}
    </div>`;
  app.innerHTML = `
  <div class="wrap page stack">
    <div><p class="muted" style="margin:0">${e(state.user.business_name || '')}</p><h1>Mis pedidos</h1></div>
    <div class="kpis">
      <div class="kpi main"><b>${mxn(s.savings_c)}</b><span>ahorro en compras recogidas</span></div>
      <div class="kpi"><b>${kg(s.collected_g)}</b><span>rescatados</span></div>
      <div class="kpi"><b>${mxn(s.spent_c)}</b><span>pagados a productores</span></div>
      <div class="kpi"><b>${s.open_orders}</b><span>pedidos en curso</span></div>
    </div>
    ${enRuta.length ? `<div class="notice info"><svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> ${enRuta.length === 1 ? 'Tu pedido va en camino.' : `${enRuta.length} pedidos van en camino.`} Toca “Ver dónde va” para seguirlo en el mapa.</div>` : ''}
    <div class="row"><a class="btn secondary" href="#/ofertas"><svg class="i" aria-hidden="true"><use href="/icons.svg#basket"/></svg> Ver todo lo que puedo comprar</a><a class="btn ghost" href="#/mapa"><svg class="i" aria-hidden="true"><use href="/icons.svg#map"/></svg> Mapa</a></div>
    <h2>En curso</h2>
    ${active.length ? active.map(row).join('') : empty('<svg class="i" aria-hidden="true"><use href="/icons.svg#basket"/></svg>', 'No tienes pedidos en curso', 'Aparta producto fresco con descuento cerca de tu negocio.', '<a class="btn" href="#/ofertas">Ver ofertas</a>')}
    <h2>Historial</h2>
    ${past.length ? past.map(row).join('') : '<p class="muted">Aún no tienes pedidos terminados.</p>'}
  </div>`;
}
