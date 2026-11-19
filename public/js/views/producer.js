import { api } from '../api.js';
import { e, mxn, kg, statePill, timer, empty, media } from '../ui.js';

const lifeUsed = (l) => Math.min(100, Math.max(0, Math.round(((Date.now() - l.created_at) / (l.expires_at - l.created_at)) * 100)));

export default async function producer({ app, state }) {
  const [{ summary: s, lots }, { orders }, { deliveries }] = await Promise.all([api('/api/producer/summary'), api('/api/orders?as=productor'), api('/api/deliveries')]);
  const toAssign = deliveries.filter((d) => d.status === 'abierta').length;
  const toConfirm = orders.filter((o) => o.status === 'apartado').length;
  const toDeliver = orders.filter((o) => ['confirmado', 'listo'].includes(o.status)).length;
  const active = lots.filter((l) => ['disponible', 'por_vencer', 'pausado'].includes(l.state));
  const past = lots.filter((l) => !['disponible', 'por_vencer', 'pausado'].includes(l.state));

  const row = (l, reuse) => `
    <div class="card row" style="flex-wrap:nowrap;gap:12px">
      <div style="font-size:2rem;width:52px;height:52px;display:grid;place-items:center;background:var(--cream-2);border-radius:12px;overflow:hidden;flex:none">${media(l.photo, l.product)}</div>
      <div class="grow" style="min-width:0">
        <div class="row between"><strong>${e(l.product)}</strong>${statePill(l.state)}</div>
        <div class="small muted">${kg(l.available_g)} libres · ${kg(l.reserved_g)} apartados · ${kg(l.delivered_g)} entregados · ${mxn(l.rescue_price_c)}/kg</div>
        ${['disponible', 'por_vencer'].includes(l.state) ? `<div class="small"><svg class="i" aria-hidden="true"><use href="/icons.svg#clock"/></svg> ${timer(l.expires_at)} · <svg class="i" aria-hidden="true"><use href="/icons.svg#leaf"/></svg> ${lifeUsed(l)}% de vida útil usada${l.shelf ? ` · clima ~${l.shelf.hours} h` : ''}${l.suggestion ? ' · <span class="pill warn"><svg class="i" aria-hidden="true"><use href="/icons.svg#bulb"/></svg> sugerencia de precio</span>' : ''}</div>` : `<div class="small muted">Recuperado: ${mxn(l.income_c)}</div>`}
      </div>
      <div class="stack" style="flex:none">
        <a class="btn sm secondary" href="#/oferta/${l.id}">Ver</a>
        ${reuse ? `<a class="btn sm ghost" href="#/publicar?from=${l.id}" title="Publicar de nuevo"><svg class="i" aria-hidden="true"><use href="/icons.svg#repeat"/></svg></a>` : ''}
      </div>
    </div>`;

  app.innerHTML = `
  <div class="wrap page stack">
    <div><p class="muted" style="margin:0">Hola,</p><h1>${e(state.user.name.split(' ')[0])}</h1></div>
    <div class="big-actions">
      <a class="big-action primary" href="#/publicar"><span class="ico"><svg class="i" aria-hidden="true"><use href="/icons.svg#plus"/></svg></span><span><strong>Publicar producto</strong>Menos de un minuto</span></a>
      <a class="big-action" href="#/productor/pedidos?tab=nuevos"><span class="ico"><svg class="i" aria-hidden="true"><use href="/icons.svg#inbox"/></svg></span><span><strong>Revisar pedidos</strong>Apartados por confirmar</span>${toConfirm ? `<span class="count">${toConfirm}</span>` : ''}</a>
      <a class="big-action" href="#/productor/pedidos?tab=entregar"><span class="ico"><svg class="i" aria-hidden="true"><use href="/icons.svg#box-check"/></svg></span><span><strong>Confirmar recolecciones</strong>Con el código del comprador</span>${toDeliver ? `<span class="count">${toDeliver}</span>` : ''}</a>
      <a class="big-action" href="#/productor/equipo"><span class="ico"><svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg></span><span><strong>Mi transporte</strong>Entregas a domicilio y tu personal</span>${toAssign ? `<span class="count">${toAssign}</span>` : ''}</a>
    </div>
    <div class="kpis">
      <div class="kpi main"><b>${mxn(s.income_c)}</b><span>ingresos recuperados (entregas confirmadas)</span></div>
      <div class="kpi"><b>${kg(s.delivered_g)}</b><span>entregados</span></div>
      <div class="kpi"><b>${active.length}</b><span>ofertas activas</span></div>
      <div class="kpi"><b>${s.open_orders}</b><span>pedidos en curso</span></div>
    </div>
    <h2>Mis ofertas activas</h2>
    ${active.length ? active.map((l) => row(l, false)).join('') : empty('<svg class="i" aria-hidden="true"><use href="/icons.svg#basket"/></svg>', 'No tienes ofertas activas', '¿Te sobró algo hoy? Publícalo y aparece al instante.', '<a class="btn" href="#/publicar">Publicar producto</a>')}
    <h2>Historial</h2>
    <p class="small muted">Usa <svg class="i" aria-hidden="true"><use href="/icons.svg#repeat"/></svg> para volver a publicar algo parecido sin escribir todo otra vez.</p>
    ${past.length ? past.map((l) => row(l, true)).join('') : '<p class="muted">Aquí verás tus publicaciones terminadas.</p>'}
  </div>`;
}
