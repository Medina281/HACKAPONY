import { api } from '../api.js';
import { $, e, mxn, kg } from '../ui.js';
import { municipality, productIcon } from '../shared/catalog.js';

export default async function impact({ app, query }) {
  const includeDemo = query.demo !== '0';
  const { stats: s } = await api(`/api/stats?demo=${includeDemo ? 1 : 0}`);
  const maxTop = Math.max(1, ...s.top_products.map((p) => p.g));
  const maxMuni = Math.max(1, ...s.by_municipality.map((p) => p.g));
  const funnelTotal = Math.max(1, s.published_g);
  const seg = (g, color, label) => `<i style="width:${(g / funnelTotal) * 100}%;background:${color}" title="${label}: ${kg(g)}"></i>`;

  app.innerHTML = `
  <div class="wrap page stack">
    <div class="row between">
      <div><h1 style="margin:0">Impacto</h1><p class="muted" style="margin:0">Calculado en vivo desde la base de datos · ${new Date(s.generated_at).toLocaleString('es-MX')}</p></div>
      <div class="seg" style="min-width:280px">
        <a class="btn sm ${includeDemo ? '' : 'ghost'}" href="#/impacto">Con datos demo</a>
        <a class="btn sm ${includeDemo ? 'ghost' : ''}" href="#/impacto?demo=0">Sólo reales</a>
      </div>
    </div>
    ${includeDemo && s.demo_records ? `<div class="notice">Incluye ${s.demo_records} registros de <strong>demostración (simulados)</strong>. Usa “Sólo reales” para ver únicamente lo capturado en vivo.</div>` : ''}

    <div class="kpis">
      <div class="kpi main"><b>${kg(s.collected_g)}</b><span>rescatados (entrega confirmada con código)</span></div>
      <div class="kpi main"><b>${mxn(s.producer_income_c)}</b><span>ingresos brutos para productores</span></div>
      <div class="kpi main"><b>${mxn(s.buyer_savings_c)}</b><span>ahorro bruto de comercios</span></div>
      <div class="kpi main"><b>${s.completed_orders}</b><span>pedidos completados</span></div>
      <div class="kpi"><b>${kg(s.published_g)}</b><span>publicados (${s.lots_published} lotes)</span></div>
      <div class="kpi"><b>${kg(s.available_g)}</b><span>disponibles ahora</span></div>
      <div class="kpi"><b>${kg(s.reserved_g)}</b><span>apartados en curso (${s.reserved_orders})</span></div>
      <div class="kpi"><b>${kg(s.expired_unsold_g)}</b><span>vencieron sin venderse</span></div>
      <div class="kpi"><b>${s.active_producers}</b><span>productores activos (30 días)</span></div>
      <div class="kpi"><b>${s.participating_businesses}</b><span>comercios participantes</span></div>
      <div class="kpi"><b>${s.cancelled_or_expired_orders}</b><span>pedidos cancelados o vencidos</span></div>
    </div>

    <div class="card stack">
      <h2>¿Qué pasó con lo publicado?</h2>
      <div class="funnel" role="img" aria-label="Distribución de kilos publicados">
        ${seg(s.collected_g, '#244A36', 'Recolectado')}${seg(s.reserved_g, '#72935B', 'Apartado')}${seg(s.available_g, '#C88852', 'Disponible')}${seg(s.expired_unsold_g, '#a63d2f', 'Vencido sin venta')}
      </div>
      <div class="row small">
        <span>🟩 Recolectado ${kg(s.collected_g)}</span><span>🟢 Apartado ${kg(s.reserved_g)}</span><span>🟧 Disponible ${kg(s.available_g)}</span><span>🟥 Vencido sin venta ${kg(s.expired_unsold_g)}</span>
      </div>
      <p class="tiny muted">El resto corresponde a ofertas retiradas o inventario que el productor vendió por otro canal. Publicado ≠ rescatado: sólo contamos como rescatado lo entregado y confirmado.</p>
    </div>

    <div class="split" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      <div class="card"><h3>Productos más rescatados</h3>
        ${s.top_products.length ? s.top_products.map((p) => `<div class="hbar"><span>${productIcon(p.product)} ${e(p.product)}</span><div class="track"><i style="width:${(p.g / maxTop) * 100}%"></i></div><strong>${kg(p.g)}</strong></div>`).join('') : '<p class="muted">Aún no hay entregas confirmadas.</p>'}
      </div>
      <div class="card"><h3>Rescate por municipio de origen</h3>
        ${s.by_municipality.length ? s.by_municipality.map((p) => `<div class="hbar"><span>${e(municipality(p.municipality)?.name || p.municipality)}</span><div class="track"><i style="width:${(p.g / maxMuni) * 100}%"></i></div><strong>${kg(p.g)}</strong></div>`).join('') : '<p class="muted">Aún no hay entregas confirmadas.</p>'}
      </div>
    </div>

    <details class="more"><summary>Metodología</summary>
      <ul class="small">
        <li><strong>Rescatado:</strong> suma de kilos de pedidos en estado “recolectado”, que sólo se alcanza cuando el productor captura el código de entrega del comprador.</li>
        <li><strong>Ingresos para productores:</strong> importe a precio de rescate de esas entregas. Es un valor bruto: no descuenta costos del productor.</li>
        <li><strong>Ahorro de comercios:</strong> (precio habitual declarado − precio de rescate) × kg entregados. El precio habitual lo declara el productor; no está validado contra precios de mercado (SNIIM), por lo que es una referencia.</li>
        <li><strong>Sin métricas ambientales:</strong> no mostramos CO₂ evitado porque requeriría factores de emisión por producto con fuente verificable; queda como trabajo futuro.</li>
      </ul>
    </details>
  </div>`;
}
