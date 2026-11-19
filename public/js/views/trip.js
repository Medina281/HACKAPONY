// Detalle de un flete. Transportista: ruta, contactos, su código para el productor y captura del código del comprador.
import { api } from '../api.js';
import { $, e, mxn, kg, toast, fmtDate, waLink } from '../ui.js';
import { municipality } from '../shared/catalog.js';

const STEPS = [['asignada', 'Asignado'], ['recogida', 'Recogido'], ['entregada', 'Entregado']];

export default async function trip({ app, params }) {
  const { delivery: d } = await api(`/api/deliveries/${params.id}`);
  const isCarrier = d.role === 'transportista';
  const from = municipality(d.from_muni);
  const to = municipality(d.to_muni);
  const q = (txt, m) => encodeURIComponent(`${txt || ''} ${m?.name || ''}, Michoacán`);
  const dir = `https://www.google.com/maps/dir/?api=1&origin=${q(d.producer?.pickup_point, from)}&destination=${q(d.buyer?.address, to)}&travelmode=driving`;
  const idx = STEPS.findIndex(([s]) => s === d.status);

  app.innerHTML = `
  <div class="wrap page" style="max-width:640px">
    <p><a href="${isCarrier ? '#/transportista?tab=mios' : `#/pedido/${e(d.folio)}`}">← Volver</a></p>
    <div class="ticket">
      <div class="ticket-head">
        <span class="mono-tag" style="background:rgba(255,255,255,.12);color:#fff;border-color:transparent">Flete · ${e(d.folio)}</span>
        <h1 style="font-size:2rem;margin-top:8px">${e(d.from_name)} → ${e(d.to_name)}</h1>
        <p style="margin:0">${kg(d.weight_g)} de ${e(d.product)} · ${d.distance_km} km en línea recta · ${mxn(d.fee_c)}</p>
      </div>
      <div class="ticket-body stack">
        ${d.status !== 'abierta' && d.status !== 'cancelada' ? `<div class="steps">${STEPS.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>
          <div class="row between tiny muted">${STEPS.map(([, l]) => `<span>${l}</span>`).join('')}</div>` : ''}

        ${isCarrier && d.status === 'asignada' ? `<div><div class="small muted center">Tu código de recolección · díselo al productor</div><div class="code">${e(d.pickup_code)}</div></div>` : ''}

        ${d.producer ? `<div class="card stack">
          <strong>1 · Recoger</strong>
          <div>${e(d.producer.name)}<br><span class="muted">${e(d.producer.pickup_point || 'Por acordar')} · ${e(from?.name)}</span></div>
          <div class="small">Horario: ${fmtDate(d.pickup_at)}${d.pickup_window ? ` · ${e(d.pickup_window)}` : ''}</div>
          ${isCarrier && d.status === 'asignada' ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(d.producer.phone, `Hola, soy ${d.carrier?.name || 'el transportista'} de Raíz Directa. Paso por el pedido ${d.folio} (${kg(d.weight_g)} de ${d.product}). ¿A qué hora le queda bien?`)}"><svg class="i" aria-hidden="true"><use href="/icons.svg#chat"/></svg> Avisar al productor</a>` : ''}
        </div>
        <div class="card stack">
          <strong>2 · Entregar</strong>
          <div>${e(d.buyer.name)} · ${e(d.buyer.contact)}<br><span class="muted">${e(d.buyer.address)} · ${e(to?.name)}</span></div>
          ${isCarrier && ['asignada', 'recogida'].includes(d.status) ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(d.buyer.phone, `Hola, soy el transportista de Raíz Directa con su pedido ${d.folio}. Voy en camino.`)}"><svg class="i" aria-hidden="true"><use href="/icons.svg#chat"/></svg> Avisar al comercio</a>` : ''}
        </div>
        <a class="btn secondary" target="_blank" rel="noopener" href="${dir}"><svg class="i" aria-hidden="true"><use href="/icons.svg#navigation"/></svg> Ver ruta en el mapa</a>` : '<p class="muted">Los datos de contacto aparecen al tomar el viaje.</p>'}

        ${isCarrier && d.status === 'recogida' ? `<form id="deliver" class="stack">
          <label for="code">Código de entrega que te dicta el comercio</label>
          <input id="code" name="code" inputmode="numeric" maxlength="6" placeholder="000000" style="font-size:1.6rem;letter-spacing:.3em;text-align:center;font-weight:800">
          <button class="btn big"><svg class="i" aria-hidden="true"><use href="/icons.svg#check-circle"/></svg> Entregado</button></form>` : ''}
        ${isCarrier && d.status === 'asignada' ? '<button class="btn ghost" id="release">Ya no puedo hacer este viaje</button>' : ''}
        ${d.notes ? `<p class="small muted">Notas: “${e(d.notes)}”</p>` : ''}
        ${d.needs_cold ? '<span class="pill info"><svg class="i" aria-hidden="true"><use href="/icons.svg#snow"/></svg> Requiere refrigeración</span>' : ''}
        <p class="tiny muted">El cobro del flete (${mxn(d.fee_c)}) se acuerda directo con el comercio. La distancia es en línea recta; por carretera suele ser mayor.</p>
      </div>
    </div>
  </div>`;

  $('#deliver')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api(`/api/deliveries/${d.id}/deliver`, { method: 'POST', body: { code: ev.target.code.value } });
      toast('¡Entrega registrada! <svg class="i" aria-hidden="true"><use href="/icons.svg#check-circle"/></svg>', 'ok');
      trip({ app, params });
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#release')?.addEventListener('click', async () => {
    try {
      await api(`/api/deliveries/${d.id}/release`, { method: 'POST' });
      toast('Viaje liberado para otro transportista');
      location.hash = '#/transportista';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
