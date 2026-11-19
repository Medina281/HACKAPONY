// Detalle de una entrega para el transportista del productor: a quién, dónde, cargar y entregar con el código del comercio.
import { api } from '../api.js';
import { $, e, kg, toast, fmtDate, waLink } from '../ui.js';
import { municipality } from '../shared/catalog.js';

const STEPS = [['asignada', 'Asignado'], ['recogida', 'En camino'], ['entregada', 'Entregado']];
const I = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${n}"/></svg>`;

export default async function trip({ app, params }) {
  const { delivery: d } = await api(`/api/deliveries/${params.id}`);
  const isCarrier = d.role === 'transportista';
  const from = municipality(d.from_muni);
  const to = municipality(d.to_muni);
  const q = (txt, m) => encodeURIComponent(`${txt || ''} ${m?.name || ''}, Michoacán`);
  const dir = `https://www.google.com/maps/dir/?api=1&origin=${q(d.producer?.pickup_point, from)}&destination=${q(d.buyer?.address, to)}&travelmode=driving`;
  const idx = STEPS.findIndex(([s]) => s === d.status);
  const waiting = d.status === 'asignada' && !['confirmado', 'listo'].includes(d.order_status);

  app.innerHTML = `
  <div class="wrap page" style="max-width:640px">
    <p><a href="${isCarrier ? '#/transportista' : `#/pedido/${e(d.folio)}`}">← Volver</a></p>
    <div class="ticket">
      <div class="ticket-head">
        <span class="mono-tag" style="background:rgba(255,255,255,.12);color:#fff;border-color:transparent">Entrega · ${e(d.folio)}</span>
        <h1 style="font-size:2rem;margin-top:8px">${e(d.from_name)} → ${e(d.to_name)}</h1>
        <p style="margin:0">${kg(d.weight_g)} de ${e(d.product)} · ${d.distance_km} km en línea recta</p>
      </div>
      <div class="ticket-body stack">
        ${d.status !== 'abierta' && d.status !== 'cancelada' ? `<div class="steps">${STEPS.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>
          <div class="row between tiny muted">${STEPS.map(([, l]) => `<span>${l}</span>`).join('')}</div>` : ''}
        ${d.status === 'cancelada' ? `<div class="pill muted">Entrega cancelada${d.cancel_reason ? `: ${e(d.cancel_reason)}` : ''}</div>` : ''}

        <div class="card stack">
          <strong>1 · Cargar</strong>
          <div>${e(d.producer.name)}<br><span class="muted">${e(d.producer.pickup_point || '')} · ${e(from?.name)}</span></div>
          <div class="small">Entregar: ${fmtDate(d.pickup_at)}${d.pickup_window ? ` · ${e(d.pickup_window)}` : ''}</div>
          ${isCarrier && waiting ? '<p class="small muted" style="margin:0">Tu productor aún no confirma este pedido; podrás cargarlo cuando lo confirme.</p>' : ''}
          ${isCarrier && d.status === 'asignada' && !waiting ? `<button class="btn big" id="pickup">${I('truck')} Ya cargué, voy en camino</button>` : ''}
        </div>
        <div class="card stack">
          <strong>2 · Entregar</strong>
          <div>${e(d.buyer.name)} · ${e(d.buyer.contact)}<br><span class="muted">${e(d.buyer.address)} · ${e(to?.name)}</span></div>
          ${isCarrier && ['asignada', 'recogida'].includes(d.status) ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(d.buyer.phone, `Hola, soy ${d.carrier?.name || ''} de ${d.producer.name}. Llevo su pedido ${d.folio} (${kg(d.weight_g)} de ${d.product}).`)}">${I('chat')} Avisar al comercio</a>` : ''}
          ${isCarrier && d.status === 'recogida' ? `<form id="deliver" class="stack">
            <label for="code">Código de entrega que te dicta el comercio</label>
            <input id="code" name="code" inputmode="numeric" maxlength="6" placeholder="000000" style="font-size:1.6rem;letter-spacing:.3em;text-align:center;font-weight:800">
            <button class="btn big">${I('check-circle')} Entregado</button></form>` : ''}
        </div>
        ${['asignada', 'recogida'].includes(d.status) ? `<a class="btn secondary" target="_blank" rel="noopener" href="${dir}">${I('navigation')} Ver ruta en el mapa</a>` : ''}
        ${d.notes ? `<p class="small muted">Notas del comercio: “${e(d.notes)}”</p>` : ''}
        ${d.needs_cold ? `<span class="pill info">${I('snow')} Requiere refrigeración</span>` : ''}
        <p class="tiny muted">La distancia es en línea recta; por carretera suele ser mayor. El pago del pedido se arregla directo entre el comercio y el productor.</p>
      </div>
    </div>
  </div>`;

  $('#pickup')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try {
      await api(`/api/deliveries/${d.id}/pickup`, { method: 'POST' });
      toast('Listo: el comercio ya sabe que vas en camino', 'ok');
      trip({ app, params });
    } catch (err) {
      ev.target.disabled = false;
      toast(err.message, 'error');
    }
  });
  $('#deliver')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api(`/api/deliveries/${d.id}/deliver`, { method: 'POST', body: { code: ev.target.code.value } });
      toast('¡Entrega registrada!', 'ok');
      trip({ app, params });
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
