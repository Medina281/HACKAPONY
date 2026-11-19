import { api } from '../api.js';
import { e, mxn, kg, statePill, orderPill, toast, fmtDate } from '../ui.js';
import { REPORT_REASONS, municipality } from '../shared/catalog.js';

const TABS = [['reportes', '🚩 Reportes'], ['ofertas', '🧺 Ofertas'], ['pedidos', '📦 Pedidos'], ['fletes', '🚚 Fletes'], ['usuarios', '👥 Usuarios'], ['precios', '📈 Precios SNIIM']];

export default async function admin({ app, query }) {
  const tab = TABS.some((t) => t[0] === query.tab) ? query.tab : 'reportes';
  const d = await api('/api/admin/overview');
  const s = d.stats;
  const openReports = d.reports.filter((r) => r.status === 'abierto').length;
  const expired = d.lots.filter((l) => l.state === 'vencido').length;
  const reasonLabel = (id) => REPORT_REASONS.find((r) => r.id === id)?.label || id;

  const tables = {
    reportes: () => d.reports.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Motivo</th><th>Sobre</th><th>Reporta</th><th>Estado</th><th></th></tr></thead><tbody>
      ${d.reports.map((r) => `<tr><td>${fmtDate(r.created_at)}</td><td>${e(reasonLabel(r.reason))}<div class="tiny muted">${e(r.details || '')}</div></td>
      <td>${r.lot_id ? `<a href="#/oferta/${r.lot_id}">${e(r.product || 'Oferta')} #${r.lot_id}</a>` : ''} ${r.folio ? `<a href="#/pedido/${e(r.folio)}">${e(r.folio)}</a>` : ''}</td>
      <td>${e(r.reporter)}</td><td><span class="pill ${r.status === 'abierto' ? 'warn' : 'muted'}">${e(r.status)}</span></td>
      <td>${r.status === 'abierto' ? `<div class="row"><button class="btn sm" data-report="${r.id}" data-s="resuelto">Resolver</button>
        ${r.lot_id ? `<button class="btn secondary sm" data-report="${r.id}" data-s="resuelto" data-pause>Pausar oferta</button><button class="btn danger sm" data-report="${r.id}" data-s="resuelto" data-suspend>Suspender productor</button>` : ''}
        <button class="btn ghost sm" data-report="${r.id}" data-s="descartado">Descartar</button></div>` : e(r.resolution || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin reportes. Cuando alguien reporte una oferta o pedido, llegará aquí y te avisaremos con la campanita.</p>',
    fletes: () => d.deliveries.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Pedido</th><th>Ruta</th><th>Carga</th><th>Pago</th><th>Comercio</th><th>Transportista</th><th>Estado</th></tr></thead><tbody>
      ${d.deliveries.map((x) => `<tr><td>${x.id}</td><td><a href="#/pedido/${e(x.folio)}">${e(x.folio)}</a> · ${e(x.product)}</td><td>${e(municipality(x.from_muni)?.name)} → ${e(municipality(x.to_muni)?.name)} (${x.distance_km} km)</td><td>${kg(x.weight_g)}</td><td>${mxn(x.fee_c)}</td><td>${e(x.buyer || '')}</td><td>${e(x.carrier || '—')}</td><td><span class="pill ${x.status === 'entregada' ? 'done' : x.status === 'abierta' ? 'warn' : 'info'}">${e(x.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin fletes.</p>',
    precios: () => `<div class="row between"><p class="small muted" style="margin:0">Caché de precios del SNIIM (se actualiza cada 12 h al consultarse). Fuente: Secretaría de Economía.</p><button class="btn sm" data-refresh>Actualizar todos ahora</button></div>
      ${d.market.length ? `<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Variedad SNIIM</th><th>Mercado</th><th>Fecha</th><th>Frecuente</th><th>Consultado</th></tr></thead><tbody>
      ${d.market.map((m) => `<tr><td>${e(m.product)}</td><td>${e(m.variety)}</td><td>${e(m.market)}</td><td>${e(m.price_date || '')}</td><td>${mxn(m.freq_c)}/kg</td><td>${fmtDate(m.fetched_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay precios guardados.</p>'}
      ${d.market_errors.length ? `<details class="more"><summary>Últimos errores de consulta (${d.market_errors.length})</summary>${d.market_errors.map((x) => `<div class="tiny">${e(x.product)} · ${fmtDate(x.fetched_at)} · ${e(x.error)}</div>`).join('')}</details>` : ''}`,
    ofertas: () => `<div class="table-wrap"><table><thead><tr><th>#</th><th>Producto</th><th>Productor</th><th>Estado</th><th>Disp./Total</th><th>Precio</th><th>Vence</th><th></th></tr></thead><tbody>
      ${d.lots.map((l) => `<tr><td>${l.id}</td><td><a href="#/oferta/${l.id}">${e(l.product)}</a>${l.is_demo ? ' <span class="pill demo">demo</span>' : ''}</td><td>${e(l.producer.name)}<div class="tiny muted">${e(municipality(l.municipality)?.name)}</div></td>
      <td>${statePill(l.state)}</td><td>${kg(l.available_g)} / ${kg(l.total_g)}</td><td>${mxn(l.rescue_price_c)} <s class="muted">${mxn(l.ref_price_c)}</s></td><td>${fmtDate(l.expires_at)}</td>
      <td>${!['retirado'].includes(l.state) ? `<button class="btn danger sm" data-retire="${l.id}">Retirar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`,
    pedidos: () => `<div class="table-wrap"><table><thead><tr><th>Folio</th><th>Producto</th><th>Kg</th><th>Total</th><th>Comercio</th><th>Productor</th><th>Estado</th></tr></thead><tbody>
      ${d.orders.map((o) => `<tr><td><a href="#/pedido/${e(o.folio)}">${e(o.folio)}</a></td><td>${e(o.product)}</td><td>${kg(o.qty_g)}</td><td>${mxn(o.total_rescue_c)}</td><td>${e(o.buyer)}</td><td>${e(o.producer)}</td><td>${orderPill(o.status)}</td></tr>`).join('')}</tbody></table></div>`,
    usuarios: () => `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Teléfono</th><th>Municipio</th><th>Estado</th><th></th></tr></thead><tbody>
      ${d.users.map((u) => `<tr><td>${e(u.business_name || u.name)}<div class="tiny muted">${e(u.name)}</div></td><td>${e(u.role)}</td><td>${e(u.phone)}</td><td>${e(municipality(u.municipality)?.name)}</td>
      <td>${u.active ? '<span class="pill ok">activo</span>' : '<span class="pill danger">suspendido</span>'}</td>
      <td>${u.role !== 'admin' ? `<button class="btn ${u.active ? 'danger' : 'secondary'} sm" data-user="${u.id}" data-active="${u.active ? 0 : 1}">${u.active ? 'Suspender' : 'Reactivar'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`,
  };

  app.innerHTML = `
  <div class="wrap page stack">
    <h1>Administración</h1>
    <div class="kpis">
      <div class="kpi ${openReports ? 'main' : ''}"><b>${openReports}</b><span>reportes abiertos</span></div>
      <div class="kpi"><b>${expired}</b><span>ofertas vencidas</span></div>
      <div class="kpi"><b>${d.users.length}</b><span>usuarios (${d.users.filter((u) => u.role === 'transportista').length} transportistas)</span></div>
      <div class="kpi"><b>${s.completed_orders}</b><span>operaciones completadas · ${kg(s.collected_g)}</span></div>
    </div>
    <div class="tabs">${TABS.map(([id, l]) => `<a class="chip ${id === tab ? 'on' : ''}" href="#/admin?tab=${id}" style="text-decoration:none">${l}</a>`).join('')}</div>
    ${tables[tab]()}
  </div>`;

  const reload = () => admin({ app, query: { tab } });
  app.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.report) {
        const resolution = b.dataset.s === 'resuelto' ? prompt('Nota para quien reportó (opcional)', 'Revisado por administración') : 'Sin elementos suficientes';
        if (resolution == null) return;
        await api(`/api/admin/reports/${b.dataset.report}`, { method: 'POST', body: { status: b.dataset.s, resolution, pause_lot: 'pause' in b.dataset, suspend_producer: 'suspend' in b.dataset } });
      } else if (b.dataset.retire) {
        if (!confirm('¿Retirar esta oferta del tablero?')) return;
        await api(`/api/lots/${b.dataset.retire}/status`, { method: 'POST', body: { status: 'retirado' } });
      } else if ('refresh' in b.dataset) {
        b.disabled = true;
        b.textContent = 'Consultando SNIIM…';
        const { results } = await api('/api/admin/market/refresh', { method: 'POST' });
        const ok = Object.values(results).filter((r) => r.ok).length;
        toast(`SNIIM: ${ok} de ${Object.keys(results).length} productos actualizados`, ok ? 'ok' : 'error');
      } else if (b.dataset.user) {
        await api(`/api/admin/users/${b.dataset.user}/active`, { method: 'POST', body: { active: b.dataset.active === '1' } });
      } else return;
      toast('Hecho', 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}
