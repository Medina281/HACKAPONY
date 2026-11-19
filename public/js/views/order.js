import { api } from '../api.js';
import { $, e, mxn, kg, orderPill, fmtDate, toast, waLink, timer, ensureGeo, muniPicker, wireMuniPickers } from '../ui.js';
import { qualityLabel, municipality, MUNICIPALITIES } from '../shared/catalog.js';
import { reportDialog } from './lot.js';

const STEPS = ['apartado', 'confirmado', 'listo', 'recolectado'];
const CANCEL_REASONS = {
  comprador: [['Ya no lo necesito', 'Ya no lo necesito'], ['No podré recogerlo', 'No podré recogerlo a tiempo'], ['no_corresponde', 'Al recoger, el producto no correspondía a lo publicado']],
  productor: [['Ya se vendió por otro canal', 'Ya se vendió por otro canal'], ['El producto se deterioró', 'El producto se deterioró'], ['El comprador no se presentó', 'El comprador no se presentó'], ['Otro motivo', 'Otro motivo']],
};

export default async function orderView({ app, params, state }) {
  await ensureGeo();
  const { order: o } = await api(`/api/orders/${params.folio}`);
  // El productor elige a quién de su personal manda; sólo hace falta la lista si hay entrega por asignar.
  const drivers = o.role === 'productor' && o.delivery && ['abierta', 'asignada'].includes(o.delivery.status)
    ? (await api('/api/producer/drivers')).drivers.filter((x) => x.active) : [];
  const isBuyer = o.role === 'comprador';
  const isProducer = o.role === 'productor';
  const active = ['apartado', 'confirmado', 'listo'].includes(o.status);
  const stepIdx = STEPS.indexOf(o.status);
  const muni = municipality(o.municipality);
  const mapQuery = encodeURIComponent(`${o.pickup_point || ''} ${muni?.name || ''}, Michoacán`);
  const msgBuyer = `Hola, realicé una reserva de ${kg(o.qty_g)} de ${o.product} mediante Raíz Directa. Mi folio es ${o.folio}. Me gustaría confirmar el horario de recolección (${fmtDate(o.pickup_at)}).`;
  const msgProducer = `Hola ${o.buyer.contact}, soy de ${o.producer.name}. Recibí su pedido ${o.folio} de ${kg(o.qty_g)} de ${o.product} en Raíz Directa. Lo espero ${fmtDate(o.pickup_at)}${o.pickup_point ? ` en: ${o.pickup_point}` : ''}.`;
  const details = `Pedido ${o.folio} · Raíz Directa\n${kg(o.qty_g)} de ${o.product}\nTotal: ${mxn(o.total_rescue_c)} (ahorro ${mxn(o.savings_c)})\nRecolección: ${fmtDate(o.pickup_at)}\nLugar: ${o.pickup_point || muni?.name}`;

  app.innerHTML = `
  <div class="wrap page" style="max-width:640px">
    <p><a href="${isProducer ? '#/productor/pedidos' : isBuyer ? '#/comprador' : '#/admin'}">← Pedidos</a></p>
    <div class="ticket">
      <div class="ticket-head">
        <div class="row between"><span class="small" style="opacity:.85">Folio</span>${orderPill(o.status)}</div>
        <h1 style="font-size:2.2rem">${e(o.folio)}</h1>
        <p style="margin:0">${o.status === 'recolectado' ? '¡Entregado! Gracias por rescatar alimento <svg class="i" aria-hidden="true"><use href="/icons.svg#sprout"/></svg>' : o.status === 'cancelado' ? 'Pedido cancelado' : o.status === 'vencido' ? 'Venció sin recolección; el producto se liberó.' : isBuyer ? 'Apartado. Listo para recolección directa con el productor.' : 'Un comercio apartó tu producto.'}</p>
      </div>
      <div class="ticket-body stack">
        ${active || o.status === 'recolectado' ? `<div class="steps" aria-label="Avance del pedido">${STEPS.map((s, i) => `<i class="${i <= stepIdx ? 'on' : ''}" title="${s}"></i>`).join('')}</div>
        <div class="row between tiny muted"><span>Apartado</span><span>Confirmado</span><span>Listo</span><span>Recogido</span></div>` : ''}

        ${isBuyer && active ? `<div><div class="small muted center">Código de entrega · muéstralo al recoger</div><div class="code" aria-label="Código de entrega">${e(o.delivery_code)}</div>
          <p class="tiny muted center" style="margin-top:6px">El productor lo captura para confirmar la entrega. No lo compartas antes de recibir tu producto.</p></div>` : ''}

        <dl class="kv">
          <dt>Producto</dt><dd>${e(o.product)} · <span class="muted">${e(qualityLabel(o.quality))}</span></dd>
          <dt>Cantidad</dt><dd>${kg(o.qty_g)}</dd>
          <dt>Precio</dt><dd>${mxn(o.unit_rescue_c)}/kg <span class="muted">(precio del productor ${mxn(o.unit_ref_c)})</span></dd>
          <dt>Importe total</dt><dd style="font-size:1.25rem">${mxn(o.total_rescue_c)}</dd>
          <dt>Ahorro</dt><dd style="color:var(--green)">${mxn(o.savings_c)} <span class="muted">(${mxn(o.total_ref_c)} − ${mxn(o.total_rescue_c)})</span></dd>
          <dt>${isBuyer ? 'Productor' : 'Comercio'}</dt><dd>${e(isBuyer ? o.producer.name : `${o.buyer.name} · ${o.buyer.contact}`)}</dd>
          <dt>Recolección</dt><dd>${e(o.pickup_point || 'Por acordar')}<br><span class="muted">${e(muni?.name || '')}${o.pickup_window ? ` · ${e(o.pickup_window)}` : ''}</span></dd>
          <dt>Horario acordado</dt><dd>${fmtDate(o.pickup_at)}${active ? `<br><span class="small muted">Tolerancia hasta ${fmtDate(o.hold_until)} · ${timer(o.hold_until)}</span>` : ''}</dd>
          <dt>Contacto</dt><dd>WhatsApp ${e(isBuyer ? o.producer.phone : o.buyer.phone)}</dd>
          <dt>Pago</dt><dd>Directo al recoger: efectivo o transferencia. <span class="muted">Raíz Directa no procesa pagos.</span></dd>
        </dl>

        ${active ? `<div class="stack">
          <a class="btn wa big" target="_blank" rel="noopener" href="${waLink(isBuyer ? o.producer.phone : o.buyer.phone, isBuyer ? msgBuyer : msgProducer)}"><svg class="i" aria-hidden="true"><use href="/icons.svg#chat"/></svg> ${isBuyer ? 'Confirmar horario por WhatsApp' : 'Escribir al comprador'}</a>
          <div class="two">
            <a class="btn secondary" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}"><svg class="i" aria-hidden="true"><use href="/icons.svg#navigation"/></svg> Cómo llegar</a>
            <a class="btn ghost" target="_blank" rel="noopener" href="${waLink('', details)}"><svg class="i" aria-hidden="true"><use href="/icons.svg#share"/></svg> Enviar datos</a>
          </div>
          <p class="tiny muted">“Cómo llegar” busca la referencia escrita por el productor; confirma la ubicación exacta por WhatsApp.</p>
        </div>` : ''}

        ${deliveryBlock(o, isBuyer, isProducer, active, state, drivers)}

        ${isProducer && active ? `<div class="card stack" style="background:var(--cream)">
          ${o.status === 'apartado' ? `<button class="btn block" data-act="confirmar"><svg class="i" aria-hidden="true"><use href="/icons.svg#check"/></svg> Confirmar pedido</button>` : ''}
          ${o.status === 'confirmado' ? `<button class="btn secondary block" data-act="listo"><svg class="i" aria-hidden="true"><use href="/icons.svg#package"/></svg> Marcar listo para recoger</button>` : ''}
          ${o.status !== 'apartado' && !(o.delivery && ['asignada', 'recogida'].includes(o.delivery.status)) ? `<form id="deliver" class="stack"><label for="code">Código que te dicta el comprador</label>
            <input id="code" name="code" inputmode="numeric" maxlength="6" placeholder="000000" style="font-size:1.6rem;letter-spacing:.3em;text-align:center;font-weight:800">
            <button class="btn big"><svg class="i" aria-hidden="true"><use href="/icons.svg#check-circle"/></svg> Registrar entrega</button></form>` : ''}
        </div>` : ''}

        ${active && (isBuyer || isProducer) ? `<details class="more"><summary>Cancelar pedido</summary>
          <form id="cancel" class="stack" style="margin-top:10px">
            <select name="reason">${CANCEL_REASONS[o.role].map(([v, l]) => `<option value="${e(v)}">${e(l)}</option>`).join('')}</select>
            <p class="tiny muted">${isBuyer ? 'Si el producto no correspondía a lo publicado, se abre un reporte y la oferta se pausa para revisión.' : 'Los kilos regresan a tu oferta si sigue vigente.'}</p>
            <button class="btn danger">Cancelar pedido</button>
          </form></details>` : ''}

        ${o.status === 'cancelado' && o.cancel_reason ? `<div class="notice">Motivo: ${e(o.cancel_reason === 'no_corresponde' ? 'El producto no correspondía a lo publicado' : o.cancel_reason)}</div>` : ''}

        <div><h3>Historial</h3><ul class="timeline">${o.events.map((ev) => `<li><strong>${e(ev.to_status)}</strong> · ${fmtDate(ev.created_at)}${ev.note ? `<br><span class="muted">${e(ev.note)}</span>` : ''}</li>`).join('')}</ul></div>
        ${o.is_demo ? '<p class="tiny muted">Pedido de demostración (datos ficticios).</p>' : ''}
        <button class="btn ghost sm" id="report"><svg class="i" aria-hidden="true"><use href="/icons.svg#flag"/></svg> Reportar un problema</button>
      </div>
    </div>
  </div>`;

  wireMuniPickers(app);
  const reload = () => orderView({ app, params, state });
  const act = async (action, body = {}) => {
    try {
      await api(`/api/orders/${o.folio}/${action}`, { method: 'POST', body });
      toast(action === 'entregar' ? '¡Entrega registrada! <svg class="i" aria-hidden="true"><use href="/icons.svg#check-circle"/></svg>' : 'Pedido actualizado', 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  app.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  $('#deliver')?.addEventListener('submit', (ev) => (ev.preventDefault(), act('entregar', { code: ev.target.code.value })));
  $('#cancel')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (confirm('¿Seguro que quieres cancelar este pedido?')) act('cancelar', { reason: ev.target.reason.value });
  });
  $('#report').addEventListener('click', () => reportDialog({ folio: o.folio }));

  // ---------- Entrega a domicilio (transporte del productor) ----------
  $('#askTruck')?.addEventListener('click', () => { $('#truckForm').hidden = false; $('#askTruck').hidden = true; });
  $('#truckForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    try {
      if (!fd.dest_lat) { delete fd.dest_lat; delete fd.dest_lng; }
      await api('/api/deliveries', { method: 'POST', body: { ...fd, folio: o.folio, needs_cold: !!fd.needs_cold } });
      toast('Listo: el productor ya sabe que se lo lleve', 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#useHere')?.addEventListener('change', (ev) => {
    const f = $('#truckForm');
    const msg = $('#hereMsg');
    if (!ev.target.checked) { f.dest_lat.value = ''; f.dest_lng.value = ''; msg.textContent = ''; return; }
    if (!('geolocation' in navigator)) { ev.target.checked = false; msg.textContent = 'Este navegador no permite leer tu ubicación.'; return; }
    msg.textContent = 'Leyendo tu ubicación…';
    navigator.geolocation.getCurrentPosition(
      (p) => { f.dest_lat.value = p.coords.latitude; f.dest_lng.value = p.coords.longitude; msg.textContent = `Listo (±${Math.round(p.coords.accuracy)} m). Sólo la verán el productor y su transportista.`; },
      () => { ev.target.checked = false; msg.textContent = 'No se pudo leer tu ubicación; se usará el municipio.'; },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
  $('#cancelTruck')?.addEventListener('click', async () => {
    try {
      await api(`/api/deliveries/${o.delivery.id}/cancel`, { method: 'POST', body: { reason: isBuyer ? 'Lo recojo yo' : '' } });
      toast('Entrega a domicilio cancelada');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#assign')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api(`/api/deliveries/${o.delivery.id}/assign`, { method: 'POST', body: { carrier_id: ev.target.carrier_id.value } });
      toast('Entrega asignada a tu transportista', 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

const I = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${n}"/></svg>`;
const DSTATUS = { abierta: 'Esperando que el productor asigne', asignada: 'Transportista asignado', recogida: 'En camino', entregada: 'Entregado', cancelada: 'Entrega cancelada' };

function deliveryBlock(o, isBuyer, isProducer, active, state, drivers) {
  const d = o.delivery && o.delivery.status !== 'cancelada' ? o.delivery : null;
  if (!d) {
    if (!(isBuyer && active)) return '';
    if (!o.producer_transport) return `<div class="small muted">${I('truck')} Este productor no ofrece entrega a domicilio: se recoge en su punto.</div>`;
    return `<div class="card stack">
      <div class="row between"><strong>${I('truck')} ¿Te lo llevan?</strong><span class="mono-tag">opcional</span></div>
      <p class="small muted" style="margin:0">${e(o.producer.name)} entrega con su propio transporte. Pídelo y te avisamos quién lo lleva.</p>
      <button class="btn secondary" id="askTruck">Pedir entrega a domicilio</button>
      <form id="truckForm" class="stack" hidden>
        <div class="field"><label for="address">Dirección de entrega</label><input id="address" name="address" placeholder="Calle, número, colonia" required></div>
        ${muniPicker('to_muni', state.user.municipality)}
        <label class="inline-check"><input type="checkbox" name="needs_cold"><span>Necesita refrigeración</span></label>
        <label class="inline-check"><input type="checkbox" id="useHere"><span>Usar mi ubicación actual como punto de entrega <span class="tiny muted">(más exacto para el tiempo de llegada)</span></span></label>
        <input type="hidden" name="dest_lat"><input type="hidden" name="dest_lng">
        <div class="tiny muted" id="hereMsg"></div>
        <input name="notes" placeholder="Notas (opcional): horario, referencias…">
        <p class="tiny muted" style="margin:0">Si hay costo de envío, lo acuerdas directo con el productor.</p>
        <button class="btn">Pedir entrega</button>
      </form>
    </div>`;
  }
  const c = d.carrier;
  const canAssign = isProducer && ['abierta', 'asignada'].includes(d.status);
  return `<div class="card stack">
    <div class="row between"><strong>${I('truck')} Entrega a domicilio</strong><span class="pill ${d.status === 'abierta' ? 'warn' : d.status === 'entregada' ? 'done' : 'info'}">${DSTATUS[d.status]}</span></div>
    <div class="small">A ${e(d.address)}${d.needs_cold ? ` · ${I('snow')} refrigerado` : ''}</div>
    ${c ? `<div class="small">${I('user')} ${e(c.name)} · ${e(c.vehicle || '')}</div>
      ${isBuyer && d.status !== 'entregada' ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${waLink(c.phone, `Hola, sobre el pedido ${o.folio} de Raíz Directa.`)}">${I('chat')} WhatsApp a quien lo lleva</a>` : ''}` : ''}
    ${canAssign ? (drivers.length ? `<form id="assign" class="stack">
        <label for="carrier_id">${d.status === 'abierta' ? '¿Quién lo lleva?' : 'Cambiar transportista'}</label>
        <select id="carrier_id" name="carrier_id">${drivers.map((x) => `<option value="${x.id}" ${c && c.id === x.id ? 'selected' : ''}>${e(x.name)} · ${e(x.vehicle || '')}${x.capacity_kg ? ` · ${x.capacity_kg} kg` : ''}${x.active_trips ? ` · ${x.active_trips} pendientes` : ''}</option>`).join('')}</select>
        <button class="btn">${I('truck')} ${d.status === 'abierta' ? 'Asignar entrega' : 'Reasignar'}</button>
      </form>
      ${o.status === 'apartado' ? '<p class="small muted" style="margin:0">Confirma el pedido para que tu transportista pueda cargarlo.</p>' : ''}`
      : `<p class="small" style="margin:0">Aún no tienes transportistas. <a href="#/productor/equipo">Agrega a tu personal</a> o cancela la entrega para que lo recojan.</p>`) : ''}
    ${(isBuyer || isProducer) && ['abierta', 'asignada'].includes(d.status) ? `<button class="btn ghost sm" id="cancelTruck">${isBuyer ? 'Cancelar entrega (lo recojo yo)' : 'No puedo entregarlo; que lo recojan'}</button>` : ''}
    ${d.status === 'recogida' ? `<a class="btn" href="#/seguimiento/${d.id}">${I('pin')} Ver dónde va y cuánto falta</a>` : ''}
    ${['asignada'].includes(d.status) && (isBuyer || isProducer) ? `<a class="btn ghost sm" href="#/seguimiento/${d.id}">${I('pin')} Seguimiento (empieza cuando salga)</a>` : ''}
    ${isBuyer && d.status === 'recogida' ? '<p class="small" style="margin:0">Cuando llegue, dale tu <strong>código de entrega</strong> a quien lo lleva.</p>' : ''}
  </div>`;
}
