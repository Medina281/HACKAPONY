// Detalle de una entrega para el transportista del productor: a quién, dónde, cargar y entregar con el código del comercio.
import { api } from '../api.js';
import { $, e, kg, toast, fmtDate, waLink, mxn } from '../ui.js';
import { municipality } from '../shared/catalog.js';
import { onLeave } from '../app.js';
import * as geo from '../geo-share.js';

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
        <p style="margin:0">${kg(d.weight_g)} de ${e(d.product)} · ≈${d.distance_km} km por carretera</p>
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
          ${d.status !== 'cancelada' && d.total_rescue_c != null ? `<div class="calc light"><dl><dt>Producto</dt><dd>${mxn(d.total_rescue_c)}</dd><dt>Envío (≈${d.distance_km} km)</dt><dd>${mxn(d.fee_c || 0)}</dd><dt class="total">Cobrar al entregar</dt><dd class="total">${mxn(d.total_rescue_c + (d.fee_c || 0))}</dd></dl></div>` : ''}
          ${isCarrier && ['asignada', 'recogida'].includes(d.status) ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(d.buyer.phone, `Hola, soy ${d.carrier?.name || ''} de ${d.producer.name}. Llevo su pedido ${d.folio} (${kg(d.weight_g)} de ${d.product}).`)}">${I('chat')} Avisar al comercio</a>` : ''}
          ${isCarrier && d.status === 'recogida' ? `<form id="deliver" class="stack">
            <label for="code">Pide al comercio su código de entrega y escríbelo aquí</label>
            <input id="code" name="code" inputmode="numeric" maxlength="6" placeholder="000000" style="font-size:1.6rem;letter-spacing:.3em;text-align:center;font-weight:800">
            <button class="btn big">${I('check-circle')} Entregado</button></form>` : ''}
        </div>
        ${isCarrier && d.status === 'recogida' ? '<div id="share"></div>' : ''}
        ${['asignada', 'recogida'].includes(d.status) ? `<a class="btn secondary" target="_blank" rel="noopener" href="${dir}">${I('navigation')} Ver ruta en Google Maps</a>` : ''}
        ${!isCarrier && d.status === 'recogida' ? `<a class="btn" href="#/seguimiento/${d.id}">${I('pin')} Ver dónde va</a>` : ''}
        ${d.notes ? `<p class="small muted">Notas del comercio: “${e(d.notes)}”</p>` : ''}
        ${d.needs_cold ? `<span class="pill info">${I('snow')} Requiere refrigeración</span>` : ''}
        <p class="tiny muted">La distancia por carretera es estimada. El comercio paga al recibir (efectivo o transferencia); Raíz Directa no procesa pagos.</p>
      </div>
    </div>
  </div>`;

  // Compartir ubicación mientras va en camino
  const shareBox = $('#share');
  const paint = (st) => {
    if (!shareBox) return;
    shareBox.innerHTML = st.active && st.id === d.id
      ? `<div class="share-live"><span class="dot"></span><div class="grow small"><b>Compartiendo tu ubicación</b><br><span class="muted">${st.last ? `Última lectura ±${Math.round(st.last.acc)} m · ${st.sent} enviadas` : 'Buscando señal GPS…'}. Deja esta pantalla abierta.</span>${st.error ? `<br><span style="color:var(--red)">${st.error}</span>` : ''}</div><button type="button" class="btn ghost sm" id="stopShare">Dejar de compartir</button></div>`
      : `<div class="stack"><button type="button" class="btn big" id="startShare">${I('pin')} Compartir mi ubicación</button><p class="tiny muted" style="margin:0">El comercio y ${e(d.producer.name)} verán en el mapa dónde vas y cuánto falta, sólo mientras vas en camino. Se deja de compartir al entregar.</p>${st.error ? `<p class="small" style="color:var(--red);margin:0">${st.error}</p>` : ''}</div>`;
    $('#stopShare', shareBox)?.addEventListener('click', () => geo.stop());
    $('#startShare', shareBox)?.addEventListener('click', () => geo.start(d.id));
  };
  if (shareBox) { paint(geo.status()); onLeave(geo.onChange(paint)); }

  $('#pickup')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try {
      await api(`/api/deliveries/${d.id}/pickup`, { method: 'POST' });
      geo.start(d.id); // el toque en "Ya cargué" pide el permiso de ubicación
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
      geo.stop();
      toast('¡Entrega registrada!', 'ok');
      trip({ app, params });
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
