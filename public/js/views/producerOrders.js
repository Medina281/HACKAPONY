import { api } from '../api.js';
import { $, e, mxn, kg, orderPill, fmtDate, toast, empty, waLink } from '../ui.js';

const TABS = [
  ['nuevos', '📥 Por confirmar', (o) => o.status === 'apartado'],
  ['entregar', '🤝 Por entregar', (o) => ['confirmado', 'listo'].includes(o.status)],
  ['historial', '📚 Historial', (o) => ['recolectado', 'cancelado', 'vencido'].includes(o.status)],
];

export default async function producerOrders({ app, query }) {
  const tab = TABS.find((t) => t[0] === query.tab) || TABS[0];
  const { orders } = await api('/api/orders?as=productor');
  const list = orders.filter(tab[2]);

  app.innerHTML = `
  <div class="wrap page stack">
    <h1>Pedidos</h1>
    <div class="tabs">${TABS.map(([id, label, fn]) => `<a class="chip ${id === tab[0] ? 'on' : ''}" href="#/productor/pedidos?tab=${id}" style="text-decoration:none">${label} (${orders.filter(fn).length})</a>`).join('')}</div>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : empty('📭', 'Nada por aquí', tab[0] === 'nuevos' ? 'Cuando un comercio aparte tu producto te avisamos con la campanita 🔔.' : 'Sin pedidos en esta sección.')}
  </div>`;

  app.onsubmit = async (ev) => {
    const form = ev.target.closest('form[data-folio]');
    if (!form) return;
    ev.preventDefault();
    const { folio, action } = form.dataset;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api(`/api/orders/${folio}/${action}`, { method: 'POST', body: action === 'entregar' ? { code: form.code.value } : {} });
      toast(action === 'entregar' ? `Entrega registrada ✅ ${folio}` : `Pedido ${folio} actualizado`, 'ok');
      producerOrders({ app, query: { tab: action === 'entregar' ? 'historial' : 'entregar' } });
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

function card(o) {
  const msg = `Hola ${o.buyer.contact}, soy de ${o.producer.name}. Su pedido ${o.folio} de ${kg(o.qty_g)} de ${o.product} (Raíz Directa) está ${o.status === 'listo' ? 'listo para recoger' : 'confirmado'}. Lo espero ${fmtDate(o.pickup_at)}.`;
  return `
  <article class="card stack">
    <div class="row between"><strong>${e(o.folio)}</strong>${orderPill(o.status)}</div>
    <div><span style="font-size:1.15rem;font-weight:700">${kg(o.qty_g)} de ${e(o.product)}</span> · ${mxn(o.total_rescue_c)}</div>
    <div class="small muted">🍽️ ${e(o.buyer.name)} (${e(o.buyer.contact)}) · 🕑 ${fmtDate(o.pickup_at)}</div>
    ${o.status === 'apartado' ? `<form data-folio="${e(o.folio)}" data-action="confirmar"><button type="submit" class="btn block">✔️ Confirmar pedido</button></form>` : ''}
    ${o.status === 'confirmado' ? `<form data-folio="${e(o.folio)}" data-action="listo"><button type="submit" class="btn secondary block">📦 Marcar listo para recoger</button></form>` : ''}
    ${['confirmado', 'listo'].includes(o.status) ? `
      <form data-folio="${e(o.folio)}" data-action="entregar" class="row" style="flex-wrap:nowrap">
        <label class="sr" for="c-${e(o.folio)}">Código de entrega</label>
        <input id="c-${e(o.folio)}" name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="Código de 6 dígitos" required style="letter-spacing:.2em;font-weight:700">
        <button type="submit" class="btn" style="flex:none">Entregado</button>
      </form>
      <p class="tiny muted" style="margin:0">Pídele al comprador el código que aparece en su pedido. Así queda confirmada la entrega.</p>` : ''}
    <div class="row">
      ${['apartado', 'confirmado', 'listo'].includes(o.status) && o.buyer.phone ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${waLink(o.buyer.phone, msg)}">💬 WhatsApp</a>` : ''}
      <a class="btn ghost sm" href="#/pedido/${e(o.folio)}">Detalle</a>
    </div>
  </article>`;
}
