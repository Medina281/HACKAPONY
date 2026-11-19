import { api, serverNow } from '../api.js';
import { go } from '../app.js';
import { $, e, mxn, kg, media, statePill, timer, toast, fieldErrors, waLink, shareText, fmtDate, orderPill, shelfAnalysis } from '../ui.js';
import { qualityLabel, QUALITY, REPORT_REASONS, municipality } from '../shared/catalog.js';
import { orderTotals, discountPct, netSavings, haversineKm, ROAD_FACTOR, kgToGrams, pesosToCents } from '../shared/calc.js';
import { refNote } from './components.js';

const TRANSPORT_KEY = 'rd_transport';

export default async function lotView({ app, params, state }) {
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
    <p><a href="#/ofertas">← Ofertas</a></p>
    <div class="layout-2">
      <div class="stack">
        <div class="lot" data-lot="${l.id}">
          <div class="lot-media" style="height:220px;font-size:6rem">${media(l.photo, l.product)}${statePill(l.state)}<span class="disc">−${Math.round(l.discount)}%</span></div>
          <div class="lot-body">
            <div class="row between"><h1 style="margin:0">${e(l.product)}</h1>${l.is_demo ? '<span class="pill demo">dato de demostración</span>' : ''}</div>
            <div class="price">${mxn(l.rescue_price_c)}<span class="small muted" style="font-family:var(--sans)">/kg</span><s>${mxn(l.ref_price_c)} ${l.ref_source === 'sniim' ? 'SNIIM' : 'habitual*'}</s></div>
            <div class="row"><span><svg class="i" aria-hidden="true"><use href="/icons.svg#clock"/></svg> Frescura comercial estimada:</span> ${timer(l.expires_at)}</div>
            <div id="mkt" class="sniim"></div>
            <dl class="kv">
              <dt>Disponible</dt><dd>${kg(l.available_g)} de ${kg(l.total_g)}</dd>
              <dt>Compra mínima</dt><dd>${l.allow_partial ? kg(l.min_g) : 'Sólo lote completo'}</dd>
              <dt>Estado declarado</dt><dd>${e(qualityLabel(l.quality))}<div class="tiny muted">${e(q?.hint || '')}</div></dd>
              <dt>Vende</dt><dd>${e(l.producer.name)}</dd>
              <dt>Zona</dt><dd>${e(l.municipality_name)} <span class="muted small">(punto exacto al apartar)</span></dd>
              <dt>Distancia</dt><dd>~${straight} km en línea recta desde ${e(from.name)} <span class="muted small">(≈${road} km por carretera, estimado)</span></dd>
              ${l.pickup_window ? `<dt>Horario</dt><dd>${e(l.pickup_window)}</dd>` : ''}
              <dt>Transporte</dt><dd>${l.producer_transport ? '<svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> El productor puede llevarlo (acordar costo)' : 'Recoge el comprador'}</dd>
              ${isOwner && l.pickup_point ? `<dt>Punto de recolección</dt><dd>${e(l.pickup_point)}</dd>` : ''}
            </dl>
            ${l.notes ? `<p class="card" style="background:var(--cream)">“${e(l.notes)}”</p>` : ''}
            ${straight > 40 ? `<div class="notice"><svg class="i" aria-hidden="true"><use href="/icons.svg#alert"/></svg> Está a más de 40 km en línea recta. Revisa el costo de traslado abajo antes de apartar.</div>` : ''}
            <p class="tiny muted">El productor declaró que el producto es apto para consumo humano. El temporizador es una estimación comercial y no certifica la inocuidad del alimento. Revisa el producto al recogerlo.</p>
          </div>
        </div>
        ${shelfAnalysis(l)}
        ${refNote}
      </div>
      <div class="aside stack" id="side"></div>
    </div>
  </div>`;

  // Comparar con el precio de mercado oficial (SNIIM)
  api(`/api/market/${encodeURIComponent(l.product)}`).then(({ price: p }) => {
    const box = $('#mkt');
    if (!box) return;
    box.innerHTML = p.available
      ? `<div class="sniim-card"><span class="mono-tag">SNIIM</span><div><strong>${mxn(p.freq_c)}/kg</strong> <span class="tiny muted">precio frecuente de mayoreo · ${e(p.variety)} · ${e(p.market)} · ${e(p.date || '')}</span></div>
         ${l.rescue_price_c < p.freq_c ? `<span class="pill ok">${Math.round((1 - l.rescue_price_c / p.freq_c) * 100)}% abajo del mercado</span>` : '<span class="pill muted">no está abajo del mercado</span>'}</div>`
      : `<span class="tiny muted">Precio SNIIM no disponible ahora. <a href="${e(p.sniim_url)}" target="_blank" rel="noopener">Consultar SNIIM</a></span>`;
  }).catch(() => {});

  const side = $('#side');
  if (isOwner) return ownerPanel(side, l, app, state);

  // ---------- Panel de apartado (comprador) ----------
  const transport = { kmPerLiter: 10, pricePerLiter: 24, ...JSON.parse(localStorage.getItem(TRANSPORT_KEY) || '{}') };
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
      <div class="field"><label for="pickup">¿Cuándo pasas por él?</label>
        <select id="pickup" name="pickup">${pickupOptions.map((t, i) => `<option value="${t}" ${i === 1 || pickupOptions.length === 1 ? 'selected' : ''}>${fmtDate(t)}</option>`).join('')}
          <option value="${l.expires_at - 15 * 60e3}">Antes de que venza (${fmtDate(l.expires_at - 15 * 60e3)})</option>
        </select>
        <div class="hint">Tolerancia de 3 horas. Si no se recoge, el apartado vence y el producto se libera.</div>
      </div>
      <div class="calc" id="calc" aria-live="polite"></div>
      <details class="more"><summary><svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> ¿Me conviene por el traslado?</summary>
        <div class="two" style="margin-top:10px">
          <div class="field"><label class="small" for="dist">Km por carretera (ida)</label><input id="dist" inputmode="decimal" value="${road}"></div>
          <div class="field"><label class="small" for="kml">Rendimiento km/l</label><input id="kml" inputmode="decimal" value="${transport.kmPerLiter}"></div>
          <div class="field"><label class="small" for="ppl">Gasolina $/l</label><input id="ppl" inputmode="decimal" value="${transport.pricePerLiter}"></div>
        </div>
        <div class="calc light" id="net"></div>
        <p class="tiny muted">Estimación: ida y vuelta × consumo × precio de gasolina que tú indiques (valores de ejemplo; ajústalos). No incluye tu tiempo ni casetas.</p>
      </details>
      ${user?.role === 'comprador' || !user
        ? `<button class="btn big" type="submit" data-needs-open>${user ? 'Apartar ahora' : 'Entrar para apartar'}</button>`
        : '<div class="notice info">Inicia sesión con una cuenta de comercio para apartar.</div>'}
      <p class="tiny muted center">El pago se acuerda directo con el productor al recoger (efectivo o transferencia). Raíz Directa no cobra ni retiene dinero.</p>
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
  const recalc = () => {
    const g = kgToGrams(kgInput.value || 0);
    const t = orderTotals(g, l.ref_price_c, l.rescue_price_c);
    $('#calc').innerHTML = `<h3>Tu ahorro</h3><dl>
      <dt>Precio habitual (${kg(g)} × ${mxn(l.ref_price_c)})</dt><dd>${mxn(t.refTotal)}</dd>
      <dt>Precio de rescate (${kg(g)} × ${mxn(l.rescue_price_c)})</dt><dd>${mxn(t.rescueTotal)}</dd>
      <dt>Descuento</dt><dd>${discountPct(l.ref_price_c, l.rescue_price_c)}%</dd>
      <dt class="total">Ahorro bruto</dt><dd class="total">${mxn(t.savings)}</dd>
      <dt>Pagas al recoger</dt><dd>${mxn(t.rescueTotal)}</dd></dl>`;
    const kmPerLiter = Number($('#kml').value) || 0;
    const pricePerLiter = Number($('#ppl').value) || 0;
    localStorage.setItem(TRANSPORT_KEY, JSON.stringify({ kmPerLiter, pricePerLiter }));
    const n = netSavings({ savingsCents: t.savings, distanceKm: Number($('#dist').value) || 0, kmPerLiter, pricePerLiterCents: pesosToCents(pricePerLiter) });
    $('#net').innerHTML = `<dl><dt>Ahorro bruto</dt><dd>${mxn(t.savings)}</dd>
      <dt>Traslado estimado (${n.km} km)</dt><dd>−${mxn(n.transportCents)}</dd>
      <dt class="total">Ahorro neto estimado</dt><dd class="total">${mxn(n.netCents)}</dd></dl>
      ${n.netCents < 0 ? '<p class="err">Con este traslado no te conviene; busca algo más cerca o compra más kilos.</p>' : ''}`;
  };
  recalc();
  form.addEventListener('input', recalc);
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
      const { folio } = await api(`/api/lots/${l.id}/reserve`, { method: 'POST', body: { kg: kgInput.value, pickup_at: Number($('#pickup').value) } });
      toast(`¡Apartado! Folio ${folio}`, 'ok');
      go(`#/pedido/${folio}`);
    } catch (err) {
      fieldErrors(form, err.fields);
      toast(err.status === 0 ? 'Sin conexión: el apartado NO se realizó. Intenta cuando tengas señal.' : err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Apartar ahora';
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
    ${l.suggestion ? `<div class="card stack" style="border-color:var(--terra)">
      <h3><svg class="i" aria-hidden="true"><use href="/icons.svg#bulb"/></svg> Sugerencia de precio</h3>
      <p class="small">${e(l.suggestion.reason)} Bajar a <strong>${mxn(l.suggestion.price_c)}/kg</strong> (${l.suggestion.discount}% de descuento) podría ayudar a moverlo.</p>
      <p class="tiny muted">Regla simple basada en tiempo transcurrido y kilos sin apartar. Tú decides; nada cambia sin tu autorización.</p>
      <button class="btn terra" id="apply">Aplicar ${mxn(l.suggestion.price_c)}/kg</button>
    </div>` : ''}
    <div class="card stack">
      <h3>Pedidos de esta oferta (${mine.length})</h3>
      ${mine.length ? mine.map((o) => `<a href="#/pedido/${o.folio}" class="row between" style="text-decoration:none;color:inherit;border-top:1px solid var(--line);padding-top:8px"><span><strong>${e(o.folio)}</strong> · ${kg(o.qty_g)} · ${e(o.buyer.name)}</span>${orderPill(o.status)}</a>`).join('') : '<p class="muted small">Aún no hay apartados.</p>'}
    </div>
    ${alive ? `<form class="card stack" id="pricef" novalidate>
      <h3>Cambiar precio de rescate</h3>
      <div class="field"><div class="input-unit"><input name="rescue_price" inputmode="decimal" value="${l.rescue_price_c / 100}"><span>$/kg</span></div><div class="err" data-for="rescue_price"></div></div>
      <button class="btn secondary">Guardar precio</button>
      <p class="tiny muted">Los pedidos ya apartados conservan su precio.</p>
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
  $('#apply')?.addEventListener('click', async () => {
    await api(`/api/lots/${l.id}/price`, { method: 'PATCH', body: { rescue_price: l.suggestion.price_c / 100, reason: 'sugerencia_aceptada' } });
    toast('Precio actualizado', 'ok');
    reload();
  });
  $('#pricef')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api(`/api/lots/${l.id}/price`, { method: 'PATCH', body: { rescue_price: ev.target.rescue_price.value } });
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
