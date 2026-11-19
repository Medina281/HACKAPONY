import { api } from '../api.js';
import { e, mxn, kg, statePill, timer, empty, media } from '../ui.js';

export default async function producer({ app, state }) {
  const [{ summary: s, lots }, { orders }] = await Promise.all([api('/api/producer/summary'), api('/api/orders?as=productor')]);
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
        ${['disponible', 'por_vencer'].includes(l.state) ? `<div class="small">⏱ ${timer(l.expires_at)}${l.suggestion ? ' · <span class="pill warn">💡 sugerencia de precio</span>' : ''}</div>` : `<div class="small muted">Recuperado: ${mxn(l.income_c)}</div>`}
      </div>
      <div class="stack" style="flex:none">
        <a class="btn sm secondary" href="#/oferta/${l.id}">Ver</a>
        ${reuse ? `<a class="btn sm ghost" href="#/publicar?from=${l.id}" title="Publicar de nuevo">♻️</a>` : ''}
      </div>
    </div>`;

  app.innerHTML = `
  <div class="wrap page stack">
    <div><p class="muted" style="margin:0">Hola,</p><h1>${e(state.user.name.split(' ')[0])} 👋</h1></div>
    <div class="big-actions">
      <a class="big-action primary" href="#/publicar"><span class="ico">➕</span><span><strong>Publicar producto</strong>Menos de un minuto</span></a>
      <a class="big-action" href="#/productor/pedidos?tab=nuevos"><span class="ico">📥</span><span><strong>Revisar pedidos</strong>Apartados por confirmar</span>${toConfirm ? `<span class="count">${toConfirm}</span>` : ''}</a>
      <a class="big-action" href="#/productor/pedidos?tab=entregar"><span class="ico">🤝</span><span><strong>Confirmar recolecciones</strong>Con el código del comprador</span>${toDeliver ? `<span class="count">${toDeliver}</span>` : ''}</a>
    </div>
    <div class="kpis">
      <div class="kpi main"><b>${mxn(s.income_c)}</b><span>ingresos recuperados (entregas confirmadas)</span></div>
      <div class="kpi"><b>${kg(s.delivered_g)}</b><span>entregados</span></div>
      <div class="kpi"><b>${active.length}</b><span>ofertas activas</span></div>
      <div class="kpi"><b>${s.open_orders}</b><span>pedidos en curso</span></div>
    </div>
    <h2>Mis ofertas activas</h2>
    ${active.length ? active.map((l) => row(l, false)).join('') : empty('🧺', 'No tienes ofertas activas', '¿Te sobró algo hoy? Publícalo y aparece al instante.', '<a class="btn" href="#/publicar">Publicar producto</a>')}
    <h2>Historial</h2>
    <p class="small muted">Usa ♻️ para volver a publicar algo parecido sin escribir todo otra vez.</p>
    ${past.length ? past.map((l) => row(l, true)).join('') : '<p class="muted">Aquí verás tus publicaciones terminadas.</p>'}
  </div>`;
}
