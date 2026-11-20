import { ensureGeo } from '../ui.js';
import { api, serverNow } from '../api.js';
import { go } from '../app.js';
import { $, e, mxn, kg, media, statePill, timer, toast, fieldErrors, waLink, shareText, fmtDate, orderPill, shelfAnalysis } from '../ui.js';
import { qualityLabel, QUALITY, REPORT_REASONS, municipality } from '../shared/catalog.js';
import { orderTotals, discountPct, haversineKm, ROAD_FACTOR, kgToGrams } from '../shared/calc.js';
import { refNote } from './components.js';

const ADDR_KEY = 'rd_delivery_address';

export default async function lotView({ app, params, state }) {
  await ensureGeo();
  const { lot: l } = await api(`/api/lots/${params.id}`);
  const user = state.user;
  const isOwner = user && (user.id === l.producer.id || user.role === 'admin');
  const open = ['disponible', 'por_vencer'].includes(l.state);
  const q = QUALITY.find((x) => x.id === l.quality);
  const from = municipality(user?.municipality || 'morelia');
  const straight = haversineKm(from, { lat: l.lat, lng: l.lng });
  const road = Math.round(straight * ROAD_FACTOR * 10) / 10;

  app.innerHTML = `
  <div class="wrap page">
    <div class="detail-top"><a class="sq-btn" href="#/ofertas" aria-label="Volver a ofertas"><svg class="i" aria-hidden="true"><use href="/icons.svg#arrow-left"/></svg></a>
      <a class="sq-btn" target="_blank" rel="noopener" href="${waLink('', shareText(l))}" aria-label="Compartir por WhatsApp"><svg class="i" aria-hidden="true"><use href="/icons.svg#share"/></svg></a></div>
    <div class="layout-2">
      <div class="stack">
        <div class="lot" data-lot="${l.id}">
          <div class="detail-head"><h1>${e(l.product)}</h1><p class="muted">${e(qualityLabel(l.quality))} · ${e(l.municipality_name)}${l.state_name ? `, ${e(l.state_name)}` : ''}</p></div>
          <div class="lot-media detail-media">${media(l.photo, l.product)}${statePill(l.state)}<span class="disc">−${Math.round(l.discount)}%</span></div>
          <div class="lot-body">
            <div class="price-tab"><span class="muted small">Precio de rescate</span><div class="price">${mxn(l.rescue_price_c)}<small>/kg</small></div>
              <span class="tiny muted"><s>${mxn(l.ref_price_c)}</s> ${l.ref_source === 'sniim' ? 'precio SNIIM' : 'precio del productor'}</span></div>
            ${l.price_schedule ? `<div class="stack" style="gap:6px"><div class="small">${l.next_price_at ? `Precio automático: baja a <b>${mxn(l.next_price_c)}</b> en ${timer(l.next_price_at)}` : 'Precio automático: ya está en su precio más bajo.'}</div>
              <div class="price-steps">${l.price_schedule.map((t) => `<div class="${t.cents === l.rescue_price_c && Date.now() >= t.from - 60e3 && Date.now() < t.to ? 'now' : ''}"><b>${mxn(t.cents)}</b>−${t.off}%</div>`).join('')}</div></div>` : ''}
            ${l.is_demo ? '<span class="pill demo">dato de demostración</span>' : ''}
            <div class="row"><span><svg class="i" aria-hidden="true"><use href="/icons.svg#clock"/></svg> Frescura comercial estimada:</span> ${timer(l.expires_at)}</div>
            <div id="mkt" class="sniim"></div>
            <dl class="kv">
              <dt>Disponible</dt><dd>${kg(l.available_g)} de ${kg(l.total_g)}</dd>
              <dt>Compra mínima</dt><dd>${l.allow_partial ? kg(l.min_g) : 'Sólo lote completo'}</dd>
              <dt>Estado declarado</dt><dd>${e(qualityLabel(l.quality))}<div class="tiny muted">${e(q?.hint || '')}</div></dd>
              <dt>Vende</dt><dd>${e(l.producer.name)}</dd>
              <dt>Zona</dt><dd>${e(l.municipality_name)}${l.state_name ? `, ${e(l.state_name)}` : ''}${l.region && l.region !== l.state_name ? ` · región ${e(l.region)}` : ''} <span class="muted small">(punto exacto al apartar)</span></dd>
              <dt>Distancia</dt><dd>~${straight} km en línea recta desde ${e(from.name)} <span class="muted small">(≈${road} km por carretera, estimado)</span></dd>
              ${l.pickup_window ? `<dt>Horario</dt><dd>${e(l.pickup_window)}</dd>` : ''}
              <dt>Entrega</dt><dd>${l.producer_transport ? '<svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> Recoges tú o te lo lleva el transportista del productor (envío con su tarifa)' : 'Sólo se recoge en el punto del productor'}</dd>
              ${isOwner && l.pickup_point ? `<dt>Punto de recolección</dt><dd>${e(l.pickup_point)}</dd>` : ''}
            </dl>
            ${l.notes ? `<p class="card" style="background:var(--cream)">“${e(l.notes)}”</p>` : ''}
            ${straight > 40 ? `<div class="notice"><svg class="i" aria-hidden="true"><use href="/icons.svg#alert"/></svg> Está a más de 40 km en línea recta. Considera el traslado${l.producer_transport ? ' o pide que te lo lleven' : ''}.</div>` : ''}
            <p class="tiny muted">El productor declaró que el producto es apto para consumo humano. El temporizador es una estimación comercial y no certifica la inocuidad del alimento. Revisa el producto al recogerlo.</p>
          </div>
        </div>
        ${shelfAnalysis(l)}
        ${refNote}
      </div>
      <div class="aside stack" id="side"></div>
    </div>
  </div>`;

  // Comparar con el SNIIM en vivo; si no hay dato, con la referencia regional del equipo (marcada como no verificada)
  Promise.all([
    api(`/api/market/${encodeURIComponent(l.product)}`).then((x) => x.price).catch(() => null),
    api(`/api/reference/${encodeURIComponent(l.product)}?state=${encodeURIComponent(municipality(l.municipality)?.ref_state || 'Michoacán')}`).then((x) => x.reference).catch(() => null),
  ]).then(([p, r]) => {
    const box = $('#mkt');
    if (!box) return;
    const below = (c) => (l.rescue_price_c < c ? `<span class="pill ok">${Math.round((1 - l.rescue_price_c / c) * 100)}% abajo</span>` : '<span class="pill muted">no está abajo</span>');
    if (p?.available) {
      box.innerHTML = `<div class="sniim-card"><span class="mono-tag">SNIIM</span><div><strong>${mxn(p.freq_c)}/kg</strong> <span class="tiny muted">precio frecuente de mayoreo · ${e(p.variety)} · ${e(p.market)} · ${e(p.date || '')}</span></div>${below(p.freq_c)}</div>`;
    } else if (r?.available) {
      const v = r.variants[0];
      box.innerHTML = `<div class="sniim-card"><span class="mono-tag">${r.verified ? 'SNIIM' : 'Referencia'}</span><div><strong>${mxn(v.freq_c)}/kg</strong> <span class="tiny muted">${e(v.name)} · ${e(r.markets[0] || r.state)} · ${r.verified ? e(r.label) : 'referencia del equipo, no verificada'}</span></div>${below(v.freq_c)}</div>`;
    } else if (p) {
      box.innerHTML = `<span class="tiny muted">Precio SNIIM no disponible ahora. <a href="${e(p.sniim_url)}" target="_blank" rel="noopener">Consultar SNIIM</a></span>`;
    }
  });

  const side = $('#side');
  if (isOwner) return ownerPanel(side, l, app, state);

  // ---------- Panel de apartado (comprador) ----------
  const startKg = Math.min(l.available_g, Math.max(l.min_g, Math.min(20000, l.available_g))) / 1000;
  const maxPickup = Math.min(l.expires_at, serverNow() + 72 * 3600e3);
  const pickupOptions = [1, 2, 4, 8, 24].map((h) => serverNow() + h * 3600e3).filter((t) => t <= l.expires_at);

  side.innerHTML = open ? `
    <form id="res" class="card stack" novalidate>
      <h2 style="margin:0">Apartar</h2>
      <div class="field"><label for="kgq">¿Cuántos kilos?</label>
        <div class="row" style="flex-wrap:nowrap">
          <button type="button" class="btn secondary" data-step="-1" aria-label="Menos">−</button>
          <div class="input-unit grow"><input id="kgq" name="kg" inputmode="decimal" value="${l.allow_partial ? startKg : l.available_g / 1000}" ${l.allow_partial ? '' : 'readonly'}><span>kg</span></div>
          <button type="button" class="btn secondary" data-step="1" aria-label="Más">+</button>
        </div>
        ${l.allow_partial ? `<div class="chips">${[...new Set([l.min_g / 1000, 10, 20, 50].filter((v) => v * 1000 <= l.available_g && v * 1000 >= l.min_g)), l.available_g / 1000].map((v) => `<button type="button" class="chip" data-kg="${v}">${v === l.available_g / 1000 ? `Todo (${v} kg)` : `${v} kg`}</button>`).join('')}</div>` : ''}
        <div class="err" data-for="kg"></div>
      </div>
      ${l.producer_transport ? `<div class="field"><span class="label" id="howLbl">¿Cómo lo recibes?</span>
        <div class="seg" role="radiogroup" aria-labelledby="howLbl">
          <button type="button" class="on" data-how="pickup" role="radio" aria-checked="true">Paso por él</button>
          <button type="button" data-how="delivery" role="radio" aria-checked="false">Que me lo traigan</button>
        </div></div>
      <div id="dlv" class="stack" hidden>
        <div class="field"><label for="address">Dirección de tu negocio</label><input id="address" name="address" maxlength="200" placeholder="Calle, número y colonia" autocomplete="street-address" value="${e(localStorage.getItem(ADDR_KEY) || '')}"><div class="err" data-for="address"></div></div>
        <button type="button" class="btn ghost sm" id="useHere"><svg class="i" aria-hidden="true"><use href="/icons.svg#pin"/></svg> Usar mi ubicación actual (más exacto)</button>
        <div class="tiny muted" id="hereMsg"></div>
      </div>` : ''}
      <div class="field"><label for="pickup" id="whenLbl">¿Cuándo pasas por él?</label>
        <select id="pickup" name="pickup">${pickupOptions.map((t, i) => `<option value="${t}" ${i === 1 || pickupOptions.length === 1 ? 'selected' : ''}>${fmtDate(t)}</option>`).join('')}
          <option value="${l.expires_at - 15 * 60e3}">Antes de que venza (${fmtDate(l.expires_at - 15 * 60e3)})</option>
        </select>
        <div class="hint" id="whenHint">Tolerancia de 3 horas. Si no se recoge, el apartado vence y el producto se libera.</div>
      </div>
      <div class="calc" id="calc" aria-live="polite"></div>
      ${user?.role === 'comprador' || !user
        ? `<button class="btn big" type="submit" data-needs-open>${user ? 'Apartar ahora' : 'Entrar para apartar'}</button>`
        : '<div class="notice info">Inicia sesión con una cuenta de comercio para apartar.</div>'}
      <p class="tiny muted center">Pagas directo al productor o a su transportista al recibir (efectivo o transferencia). Raíz Directa no cobra ni retiene dinero.</p>
    </form>
    <div class="card stack">
      <h3>Compartir o preguntar</h3>
      <a class="btn wa block" target="_blank" rel="noopener" href="${waLink('', shareText(l))}"><svg class="i" aria-hidden="true"><use href="/icons.svg#share"/></svg> Compartir oferta por WhatsApp</a>
      ${l.producer.phone ? `<a class="btn ghost block" target="_blank" rel="noopener" href="${waLink(l.producer.phone, `Hola, vi su oferta de ${l.product} en Raíz Directa (${kg(l.available_g)} a ${mxn(l.rescue_price_c)}/kg). ¿Sigue disponible?`)}"><svg class="i" aria-hidden="true"><use href="/icons.svg#chat"/></svg> Preguntar disponibilidad</a>` : '<p class="tiny muted">El WhatsApp del productor se muestra a comercios registrados.</p>'}
      ${user ? '<button class="btn ghost sm" id="report"><svg class="i" aria-hidden="true"><use href="/icons.svg#flag"/></svg> Reportar publicación</button>' : ''}
    </div>` : `
    <div class="card stack">
      <h2>${l.state === 'agotado' ? 'Ya se apartó todo' : 'Esta oferta ya no está disponible'}</h2>
      <p class="muted">${l.state === 'vencido' ? 'Venció su ventana de frescura comercial y no puede apartarse.' : 'Revisa otras ofertas cercanas.'}</p>
      <a class="btn" href="#/ofertas">Ver otras ofertas</a>
    </div>`;

  if (!open) return;
  const form = $('#res');
  const kgInput = $('#kgq');
  let how = 'pickup';
  let dest = null; // ubicación exacta del comercio si la comparte
  let quoteR = null; // cotización del servidor (no editable)
  let qState = 'idle';
  const canQuote = user?.role === 'comprador';
  const loadQuote = async () => {
    if (!canQuote) { qState = 'login'; return recalc(); }
    qState = 'loading'; recalc();
    try {
      const qs = dest ? `?lat=${dest.lat}&lng=${dest.lng}` : '';
      quoteR = (await api(`/api/lots/${l.id}/delivery-quote${qs}`)).quote;
      qState = quoteR?.available ? 'ok' : 'none';
    } catch { qState = 'error'; }
    recalc();
  };
  const recalc = () => {
    const g = kgToGrams(kgInput.value || 0);
    const t = orderTotals(g, l.ref_price_c, l.rescue_price_c);
    const del = how === 'delivery';
    let ship = '';
    if (del) {
      if (qState === 'ok') ship = `<dt>Envío a tu negocio <span class="tiny">(≈${quoteR.road_km} km por carretera${quoteR.uses_location ? ', desde tu ubicación' : `, a ${e(municipality(user.municipality)?.name || 'tu municipio')}`})</span></dt><dd>${mxn(quoteR.fee_c)}</dd>
        <dt class="total">Total a pagar al recibir</dt><dd class="total">${mxn(t.rescueTotal + quoteR.fee_c)}</dd>`;
      else if (qState === 'loading') ship = '<dt>Envío</dt><dd>calculando…</dd>';
      else if (qState === 'login') ship = '<dt>Envío</dt><dd>inicia sesión para verlo</dd>';
      else if (qState === 'none') ship = '<dt>Envío</dt><dd>el productor aún no fija su tarifa</dd>';
      else ship = '<dt>Envío</dt><dd>no se pudo calcular</dd>';
    }
    $('#calc').innerHTML = `<h3>Tu pedido</h3><dl>
      <dt>A precio del productor (${kg(g)} × ${mxn(l.ref_price_c)})</dt><dd>${mxn(t.refTotal)}</dd>
      <dt>Precio de rescate de ahora (${kg(g)} × ${mxn(l.rescue_price_c)})</dt><dd>${mxn(t.rescueTotal)}</dd>
      <dt>Descuento</dt><dd>${discountPct(l.ref_price_c, l.rescue_price_c)}%</dd>
      <dt${del ? '' : ' class="total"'}>Ahorro en producto</dt><dd${del ? '' : ' class="total"'}>${mxn(t.savings)}</dd>
      ${del ? ship : `<dt>Pagas al recoger</dt><dd>${mxn(t.rescueTotal)}</dd>`}</dl>
      ${del && qState === 'ok' ? `<p class="tiny" style="margin:6px 0 0;opacity:.85">Envío con la tarifa que fijó el productor: ${mxn(quoteR.base_c)} + ${mxn(quoteR.per_km_c)} por km. Distancia estimada; queda fija al apartar.</p>` : ''}`;
  };
  const setHow = (v) => {
    how = v;
    form.querySelectorAll('[data-how]').forEach((b) => { b.classList.toggle('on', b.dataset.how === v); b.setAttribute('aria-checked', String(b.dataset.how === v)); });
    $('#dlv').hidden = v !== 'delivery';
    $('#whenLbl').textContent = v === 'delivery' ? '¿Para cuándo lo necesitas?' : '¿Cuándo pasas por él?';
    $('#whenHint').textContent = v === 'delivery'
      ? 'El transportista del productor te lo lleva; te avisamos cuando salga y puedes seguirlo en el mapa. Al recibirlo, dale tu código de entrega.'
      : 'Tolerancia de 3 horas. Si no se recoge, el apartado vence y el producto se libera.';
    if (v === 'delivery' && qState === 'idle') loadQuote(); else recalc();
  };
  recalc();
  form.addEventListener('input', (ev) => { if (ev.target.id === 'kgq') recalc(); });
  form.addEventListener('click', (ev) => { const h = ev.target.closest('[data-how]'); if (h) setHow(h.dataset.how); });
  $('#useHere')?.addEventListener('click', () => {
    const msg = $('#hereMsg');
    if (!('geolocation' in navigator)) { msg.textContent = 'Este navegador no permite leer tu ubicación; se usará tu municipio.'; return; }
    msg.textContent = 'Leyendo tu ubicación…';
    navigator.geolocation.getCurrentPosition(
      (p) => { dest = { lat: p.coords.latitude, lng: p.coords.longitude }; msg.textContent = `Ubicación lista (±${Math.round(p.coords.accuracy)} m). Sólo la verán el productor y su transportista.`; loadQuote(); },
      () => { msg.textContent = 'No se pudo leer tu ubicación; se usará tu municipio.'; },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
  form.addEventListener('click', (ev) => {
    const s = ev.target.closest('[data-step]');
    const c = ev.target.closest('[data-kg]');
    if (s && l.allow_partial) {
      const step = l.available_g >= 50000 ? 5 : 1;
      const v = Math.max(l.min_g / 1000, Math.min(l.available_g / 1000, (Number(kgInput.value) || 0) + step * Number(s.dataset.step)));
      kgInput.value = Math.round(v * 10) / 10;
    }
    if (c) kgInput.value = c.dataset.kg;
    if (s || c) recalc();
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!user) {
      sessionStorage.setItem('rd_after_login', location.hash);
      return go('#/entrar');
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Apartando…';
    try {
      const body = { kg: kgInput.value, pickup_at: Number($('#pickup').value) };
      if (how === 'delivery') {
        const address = $('#address').value.trim();
        if (address.length < 6) { fieldErrors(form, { address: 'Escribe la dirección de tu negocio' }); throw Object.assign(new Error('Falta la dirección de entrega'), { handled: true }); }
        localStorage.setItem(ADDR_KEY, address);
        body.delivery = { address, ...(dest ? { dest_lat: dest.lat, dest_lng: dest.lng } : {}) };
      }
      const { folio } = await api(`/api/lots/${l.id}/reserve`, { method: 'POST', body });
      toast(how === 'delivery' ? `¡Pedido hecho! Folio ${folio}. Te avisamos cuando salga.` : `¡Apartado! Folio ${folio}`, 'ok');
      go(`#/pedido/${folio}`);
    } catch (err) {
      if (!err.handled) fieldErrors(form, err.fields);
      toast(err.status === 0 ? 'Sin conexión: el apartado NO se realizó. Intenta cuando tengas señal.' : err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Apartar ahora';
      if (err.handled) return;
      if (err.status === 409) setTimeout(() => lotView({ app, params, state }), 1500); // refresca disponibilidad real
    }
  });
  $('#report')?.addEventListener('click', () => reportDialog({ lot_id: l.id }));
}

export function reportDialog(target) {
  const d = document.createElement('dialog');
  d.className = 'card';
  d.style.cssText = 'max-width:440px;width:92vw;border:1px solid var(--line)';
  d.innerHTML = `<form method="dialog" class="stack" id="rf">
    <h3>Reportar</h3>
    <div class="field"><label for="reason">Motivo</label><select id="reason">${REPORT_REASONS.map((r) => `<option value="${r.id}">${e(r.label)}</option>`).join('')}</select></div>
    <div class="field"><label for="details">Detalles (opcional)</label><textarea id="details" maxlength="500"></textarea></div>
    <div class="row"><button class="btn" value="ok">Enviar reporte</button><button class="btn ghost" value="cancel">Cancelar</button></div></form>`;
  document.body.append(d);
  d.showModal();
  d.addEventListener('close', async () => {
    if (d.returnValue === 'ok') {
      try {
        await api('/api/reports', { method: 'POST', body: { ...target, reason: $('#reason', d).value, details: $('#details', d).value } });
        toast('Reporte enviado. Lo revisará la administración.', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    d.remove();
  });
}

// ---------- Panel del dueño de la oferta ----------
async function ownerPanel(side, l, app, state) {
  const { orders } = state.user.role === 'productor' ? await api('/api/orders?as=productor') : { orders: [] };
  const mine = orders.filter((o) => o.lot_id === l.id);
  const alive = ['disponible', 'por_vencer', 'agotado'].includes(l.state);
  side.innerHTML = `
    <div class="card stack">
      <h3>Pedidos de esta oferta (${mine.length})</h3>
      ${mine.length ? mine.map((o) => `<a href="#/pedido/${o.folio}" class="row between" style="text-decoration:none;color:inherit;border-top:1px solid var(--line);padding-top:8px"><span><strong>${e(o.folio)}</strong> · ${kg(o.qty_g)} · ${e(o.buyer.name)}</span>${orderPill(o.status)}</a>`).join('') : '<p class="muted small">Aún no hay apartados.</p>'}
    </div>
    ${alive ? `<form class="card stack" id="pricef" novalidate>
      <h3>Corregir tu precio por kilo</h3>
      <div class="field"><div class="input-unit"><input name="ref_price" inputmode="decimal" value="${l.ref_price_c / 100}"><span>$/kg</span></div><div class="err" data-for="ref_price"></div></div>
      <button class="btn secondary">Guardar precio</button>
      <p class="tiny muted">El precio de rescate se recalcula solo con la regla automática. Los pedidos ya apartados conservan su precio.</p>
    </form>
    <form class="card stack" id="reducef" novalidate>
      <h3>¿Vendiste parte por otro lado?</h3>
      <div class="field"><label class="small">Me quedan disponibles</label><div class="input-unit"><input name="available_kg" inputmode="decimal" value="${l.available_g / 1000}"><span>kg</span></div><div class="err" data-for="available_kg"></div></div>
      <button class="btn secondary">Actualizar inventario</button>
    </form>` : ''}
    <div class="card stack">
      <h3>Acciones</h3>
      <a class="btn wa block" target="_blank" rel="noopener" href="${waLink('', shareText(l))}"><svg class="i" aria-hidden="true"><use href="/icons.svg#share"/></svg> Compartir por WhatsApp</a>
      ${state.user.role === 'productor' ? `<a class="btn secondary block" href="#/publicar?from=${l.id}"><svg class="i" aria-hidden="true"><use href="/icons.svg#repeat"/></svg> Publicar de nuevo (reutilizar)</a>` : ''}
      ${alive && l.state !== 'pausado' ? '<button class="btn ghost block" data-status="pausado"><svg class="i" aria-hidden="true"><use href="/icons.svg#pause"/></svg> Pausar</button>' : ''}
      ${l.state === 'pausado' ? '<button class="btn ghost block" data-status="activo"><svg class="i" aria-hidden="true"><use href="/icons.svg#play"/></svg> Reactivar</button>' : ''}
      ${l.state !== 'retirado' ? '<button class="btn danger block" data-status="retirado">Retirar oferta</button>' : ''}
      <p class="tiny muted">Retirar no cancela pedidos ya apartados.</p>
    </div>`;
  const reload = () => lotView({ app, params: { id: l.id }, state });
  $('#pricef')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api(`/api/lots/${l.id}/price`, { method: 'PATCH', body: { ref_price: ev.target.ref_price.value } });
      toast('Precio actualizado', 'ok');
      reload();
    } catch (err) {
      fieldErrors(ev.target, err.fields);
      toast(err.message, 'error');
    }
  });
  $('#reducef')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api(`/api/lots/${l.id}/reduce`, { method: 'POST', body: { available_kg: ev.target.available_kg.value } });
      toast('Inventario actualizado', 'ok');
      reload();
    } catch (err) {
      fieldErrors(ev.target, err.fields);
      toast(err.message, 'error');
    }
  });
  side.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-status]');
    if (!b) return;
    if (b.dataset.status === 'retirado' && !confirm('¿Retirar esta oferta? Ya no aparecerá en el tablero.')) return;
    try {
      await api(`/api/lots/${l.id}/status`, { method: 'POST', body: { status: b.dataset.status } });
      toast('Listo', 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
