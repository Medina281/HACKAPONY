import { api } from '../api.js';
import { e, mxn, kg, statePill, orderPill, toast, fmtDate } from '../ui.js';
import { REPORT_REASONS, municipality } from '../shared/catalog.js';

const TABS = [['reportes', '🚩 Reportes'], ['ofertas', '🧺 Ofertas'], ['pedidos', '📦 Pedidos'], ['usuarios', '👥 Usuarios']];

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
      <td>${r.status === 'abierto' ? `<button class="btn sm" data-report="${r.id}" data-s="resuelto">Resolver</button> <button class="btn ghost sm" data-report="${r.id}" data-s="descartado">Descartar</button>` : e(r.resolution || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin reportes.</p>',
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
      <div class="kpi ${openReports ? 'hero' : ''}"><b>${openReports}</b><span>reportes abiertos</span></div>
      <div class="kpi"><b>${expired}</b><span>ofertas vencidas</span></div>
      <div class="kpi"><b>${d.users.length}</b><span>usuarios</span></div>
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
        const resolution = b.dataset.s === 'resuelto' ? prompt('¿Cómo se resolvió?', 'Se contactó a ambas partes') : 'Sin elementos';
        if (resolution == null) return;
        await api(`/api/admin/reports/${b.dataset.report}`, { method: 'POST', body: { status: b.dataset.s, resolution } });
      } else if (b.dataset.retire) {
        if (!confirm('¿Retirar esta oferta del tablero?')) return;
        await api(`/api/lots/${b.dataset.retire}/status`, { method: 'POST', body: { status: 'retirado' } });
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
