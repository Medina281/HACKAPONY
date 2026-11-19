import { api } from '../api.js';
import { onLeave } from '../app.js';
import { $, $$, e, mxn, toast, fieldErrors, waLink, shareText, muniOptions } from '../ui.js';
import { PRODUCTS, QUALITY, CATEGORIES, normalize, municipality, qualityLabel } from '../shared/catalog.js';
import { orderTotals, discountPct, kgToGrams, pesosToCents } from '../shared/calc.js';
import { parseSpoken, parseMulti } from '../shared/parse.js';
import { takePhoto, standardizeFile, canUseCamera } from '../camera.js';
import { estimateShelfLife, CLASS_LABEL } from '../shared/shelf.js';
import { getForecast, manualForecast, MANUAL_CLIMATES, WEATHER_CREDIT } from '../weather.js';
import { mountAssistant } from '../voice/assistant.js';
import { canRecognize } from '../voice/speech.js';
import { lotCard } from './components.js';

const DRAFT = 'rd_draft';
const QUICK = ['Jitomate', 'Aguacate', 'Fresa', 'Guayaba', 'Limón', 'Mango', 'Calabacita', 'Cebolla', 'Papa', 'Plátano'];

export default async function publish({ app, query, state }) {
  const user = state.user;
  let start = null;
  let photo = null;
  let method = 'formulario';
  let forecast = null; // { source, temps, humidity }
  let shelf = null;
  let climateMuni = null;
  let initial = { hours: '', allow_partial: true, pickup_point: user.pickup_point || '', municipality: user.municipality };
  let source = '';

  const { templates } = await api('/api/templates').catch(() => ({ templates: [] }));
  if (query.from) {
    const { lot } = await api(`/api/lots/${query.from}`);
    initial = {
      ...initial, product: lot.product, category: lot.category, quality: lot.quality, kg: lot.total_g / 1000,
      min_kg: lot.min_g / 1000, allow_partial: lot.allow_partial, ref_price: lot.ref_price_c / 100,
      rescue_price: lot.original_rescue_price_c / 100, hours: lot.fresh_hours, pickup_point: lot.pickup_point || '',
      pickup_window: lot.pickup_window || '', producer_transport: lot.producer_transport, notes: lot.notes || '', municipality: lot.municipality,
    };
    source = `Copiamos los datos de tu publicación anterior de ${e(lot.product)}. Revisa kilos, precio y horas.`;
  } else if (!query.nuevo) {
    const draft = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (draft && draft.product) {
      initial = { ...initial, ...draft };
      source = 'Recuperamos el borrador que dejaste pendiente.';
    }
  }

  const v = (k) => e(initial[k] ?? '');
  app.innerHTML = `
  <div class="wrap page">
    <div class="layout-2">
      <form id="pf" class="stack" novalidate>
        <div><h1 style="margin:0">Publicar producto</h1><p class="muted">5 datos y listo. Lo demás es opcional.</p></div>
        ${source ? `<div class="notice info">${source} <button type="button" class="btn ghost sm" id="discard">Empezar de cero</button></div>` : ''}

        <div class="card quick">
          <button type="button" class="voice voice-launch" id="openVA">
            <span class="mic-big" aria-hidden="true">🎤</span>
            <span class="voice-text">
              <strong>${canRecognize ? 'Publicar hablando' : 'Publicar escribiendo como en WhatsApp'}</strong>
              <span class="small muted">${canRecognize ? 'Dímelo como un mensaje de voz; te pregunto lo que falte y tú confirmas.' : 'Tu navegador no permite dictar; escríbeme y lleno el formulario.'}</span>
            </span>
          </button>

          <button type="button" class="link-toggle" id="writeToggle" aria-expanded="false" aria-controls="writeBox">✍️ ¿Prefieres escribirlo aquí?</button>
          <div id="writeBox" class="write-box" hidden>
            <p class="phrase" aria-label="Frase para completar">
              Tengo <input class="blank n" data-s="kg" inputmode="decimal" placeholder="100" aria-label="Kilos"> kilos de
              <span class="cur"><input class="blank w" data-s="product" list="plist" placeholder="jitomate" aria-label="Producto">,</span>
              lo doy a <span class="cur">$<input class="blank n" data-s="rescue_price" inputmode="decimal" placeholder="12" aria-label="Precio de rescate"></span> el kilo
              <span class="soft">(normalmente a <span class="cur">$<input class="blank n" data-s="ref_price" inputmode="decimal" placeholder="25" aria-label="Precio de siempre"></span>)</span>
              y me quedan <input class="blank n" data-s="hours" inputmode="decimal" placeholder="24" aria-label="Horas"> horas.
            </p>
            <p class="tiny muted" style="margin:0">Lo que escribas aquí llena el formulario de abajo al instante.</p>
            <details class="paste"><summary>¿Ya lo tienes escrito en WhatsApp? Pégalo aquí</summary>
              <textarea id="speech" placeholder="Pega tu mensaje…" style="min-height:70px;margin-top:8px"></textarea>
              <button type="button" class="btn secondary sm" id="fill" style="margin-top:8px">Llenar con este mensaje</button>
            </details>
          </div>
        </div>

        ${templates.length ? `<div><div class="small muted">Mis plantillas</div><div class="chips">${templates.map((t) => `<button type="button" class="chip" data-tpl="${t.id}">⭐ ${e(t.name)}</button>`).join('')}</div></div>` : ''}

        <div class="card" id="formCard">
          <div class="field photo-field">
            <div class="photo-slot" id="photoSlot"><span>📷</span><small>Foto real del producto (opcional)</small></div>
            <div class="row">
              <button type="button" class="btn grow" id="camBtn">📷 Tomar foto</button>
              <button type="button" class="btn ghost" id="galBtn" aria-label="Elegir de la galería">🖼️</button>
              <button type="button" class="btn ghost" id="delPhoto" hidden aria-label="Quitar foto">✕</button>
            </div>
            <input type="file" id="photo" accept="image/*" hidden>
            <div class="err" data-for="photo"></div>
          </div>
          <div class="field"><label for="product">1. ¿Qué producto?</label>
            <div class="chips" id="quick">${QUICK.map((n) => `<button type="button" class="chip" data-p="${n}">${PRODUCTS.find((p) => p.name === n).icon} ${n}</button>`).join('')}</div>
            <input id="product" name="product" list="plist" value="${v('product')}" placeholder="Escribe o elige arriba" autocomplete="off">
            <datalist id="plist">${PRODUCTS.map((p) => `<option value="${e(p.name)}">`).join('')}</datalist>
            <div class="err" data-for="product"></div>
          </div>
          <div class="field"><label for="kg">2. ¿Cuántos kilos tienes?</label>
            <div class="input-unit"><input id="kg" name="kg" inputmode="decimal" value="${v('kg')}" placeholder="100"><span>kg</span></div>
            <div class="err" data-for="kg"></div>
          </div>
          <div class="two">
            <div class="field"><label for="ref_price">3. Precio de siempre</label>
              <div class="input-unit"><input id="ref_price" name="ref_price" inputmode="decimal" value="${v('ref_price')}" placeholder="25"><span>$/kg</span></div>
              <div class="hint">Al que normalmente lo vendes.</div><div class="err" data-for="ref_price"></div>
              <div class="sniim" id="sniimBox" aria-live="polite"></div>
            </div>
            <div class="field"><label for="rescue_price">4. Precio de rescate</label>
              <div class="input-unit"><input id="rescue_price" name="rescue_price" inputmode="decimal" value="${v('rescue_price')}" placeholder="12"><span>$/kg</span></div>
              <div class="chips" id="disc">${[30, 40, 50].map((d) => `<button type="button" class="chip" data-d="${d}">−${d}%</button>`).join('')}</div>
              <div class="err" data-for="rescue_price"></div>
            </div>
          </div>
          <div class="field"><label>¿Cómo está el producto?</label>
            <div class="stack" id="quality">${QUALITY.map((q) => `<label class="inline-check"><input type="radio" name="quality" value="${q.id}" ${initial.quality === q.id ? 'checked' : ''}><span>${e(q.label)}<br><span class="tiny muted">${e(q.hint)}</span></span></label>`).join('')}</div>
            <div class="notice danger small" style="margin-top:8px">Si está podrido, golpeado con daño o no apto para consumo, <strong>no se publica</strong> para venta como alimento.</div>
            <div class="err" data-for="quality"></div>
          </div>
          <div class="field"><label for="hours">5. ¿Cuántas horas le quedan para venderse fresco?</label>
            <div class="shelf" id="shelfBox" aria-live="polite"></div>
            <div class="chips" id="hrs">${[6, 12, 24, 48, 72].map((h) => `<button type="button" class="chip" data-h="${h}">${h < 48 ? `${h} h` : `${h / 24} días`}</button>`).join('')}</div>
            <div class="input-unit"><input id="hours" name="hours" inputmode="decimal" value="${v('hours')}" placeholder="24"><span>horas</span></div>
            <div class="err" data-for="hours"></div>
          </div>
          <div class="field"><label class="inline-check"><input type="checkbox" name="declaration" id="declaration"><span>Declaro que el producto es <strong>apto para consumo humano</strong> y que la información es verdadera.</span></label><div class="err" data-for="declaration"></div></div>
        </div>

        <details class="more" ${initial.notes || initial.pickup_window ? 'open' : ''}><summary>Más detalles (opcional)</summary>
          <div class="two">
            <div class="field"><label for="min_kg">Compra mínima</label><div class="input-unit"><input id="min_kg" name="min_kg" inputmode="decimal" value="${v('min_kg')}" placeholder="1"><span>kg</span></div><div class="err" data-for="min_kg"></div></div>
            <div class="field"><label for="category">Categoría</label><select id="category" name="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${initial.category === c.id ? 'selected' : ''}>${e(c.label)}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label for="municipality">Municipio de recolección</label><select id="municipality" name="municipality">${muniOptions(initial.municipality)}</select><div class="hint">Se usa para la distancia y el clima. En el tablero sólo se muestra el municipio.</div><div class="err" data-for="municipality"></div></div>
          <div class="field"><label class="inline-check"><input type="checkbox" name="allow_partial" ${initial.allow_partial !== false ? 'checked' : ''}><span>Acepto vender por partes (no sólo el lote completo)</span></label></div>
          <div class="field"><label for="pickup_point">Punto de recolección</label><input id="pickup_point" name="pickup_point" value="${v('pickup_point')}" placeholder="Ej. Entrada del rancho, junto a la báscula"><div class="hint">Sólo lo verá quien aparte.</div></div>
          <div class="field"><label for="pickup_window">Horario para recoger</label><input id="pickup_window" name="pickup_window" value="${v('pickup_window')}" placeholder="Ej. 7:00 a 13:00"></div>
          <div class="field"><label class="inline-check"><input type="checkbox" name="producer_transport" ${initial.producer_transport ? 'checked' : ''}><span>Puedo llevarlo (con costo a acordar)</span></label></div>
          <div class="field"><label for="notes">Comentarios</label><textarea id="notes" name="notes" maxlength="400" placeholder="Ej. Ideal para salsa o aguas frescas">${v('notes')}</textarea></div>
        </details>

        <div class="sticky-cta"><button class="btn big" type="submit">🌱 Revisar y publicar</button></div>
        <button type="button" class="btn ghost" id="saveTpl">⭐ Guardar como plantilla</button>
      </form>
      <aside class="aside stack"><div class="calc" id="calc"></div><div><div class="small muted" style="margin-bottom:6px">Así lo verán los compradores:</div><div id="preview"></div></div></aside>
    </div>
  </div>`;

  const f = $('#pf');
  const get = () => {
    const d = Object.fromEntries(new FormData(f));
    d.allow_partial = f.allow_partial.checked;
    d.producer_transport = f.producer_transport.checked;
    d.declaration = f.declaration.checked;
    return d;
  };
  const set = (k, val) => {
    if (val == null) return;
    if (f[k]?.type === 'checkbox') f[k].checked = !!val;
    else if (k === 'quality') $$('input[name=quality]', f).forEach((r) => (r.checked = r.value === val));
    else if (f[k]) f[k].value = val;
  };
  const autoCategory = () => {
    const p = PRODUCTS.find((x) => normalize(x.name) === normalize(f.product.value));
    if (p) f.category.value = p.category;
  };

  // ---------- Vida útil estimada por clima ----------
  async function loadClimate() {
    const box = $('#shelfBox');
    if (!box) return;
    try {
      forecast = await getForecast(f.municipality.value);
    } catch {
      forecast = forecast?.source === 'usuario' ? forecast : null;
    }
    renderShelf();
  }
  function renderShelf() {
    const box = $('#shelfBox');
    if (!box) return;
    const d = get();
    const muni = municipality(d.municipality);
    if (!forecast) {
      shelf = null;
      box.innerHTML = `<div class="small"><strong>🌡️ Sin datos de clima</strong> <span class="muted">(sin conexión o servicio no disponible). ¿Cómo está el día en ${e(muni?.name || 'tu zona')}?</span></div>
        <div class="chips">${MANUAL_CLIMATES.map((c) => `<button type="button" class="chip" data-clima="${c.temp}">${c.label}</button>`).join('')}</div>`;
      return;
    }
    shelf = estimateShelfLife({ product: d.product, quality: d.quality, temps: forecast.temps, humidity: forecast.humidity });
    const wx = forecast.source === 'open-meteo'
      ? `Clima previsto en ${e(muni?.name)}: ${Math.round(Math.min(...forecast.temps.slice(0, 24)))}–${Math.round(Math.max(...forecast.temps.slice(0, 24)))} °C en las próximas 24 h`
      : 'Clima indicado por ti';
    if (!shelf) {
      box.innerHTML = `<div class="small">🌡️ ${wx}. <span class="muted">Elige producto y estado para estimar su vida útil.</span></div>`;
      return;
    }
    const declared = Number(String(d.hours).replace(',', '.'));
    const warn = declared && declared > shelf.high ? `<div class="err" style="color:var(--terra-dark)">Declaraste ${declared} h, más de lo estimado para este clima. Tú decides, pero revisa que aguante.</div>` : '';
    box.innerHTML = `
      <div class="row between" style="gap:6px"><strong>🌡️ Vida útil estimada: ${shelf.hours >= 168 ? '7 días o más' : `~${shelf.hours} h`}</strong><span class="tiny muted">${shelf.hours >= 168 ? 'máximo publicable: 168 h' : `rango ${shelf.low}–${shelf.high} h`}</span></div>
      <div class="small muted">${wx}; promedio ${shelf.temp_mean} °C${shelf.humidity != null ? `, humedad ${shelf.humidity}%` : ''}. ${e(CLASS_LABEL[shelf.cls])} · ${e(qualityLabel(d.quality))}.</div>
      ${shelf.notes.map((n) => `<div class="tiny">• ${e(n)}</div>`).join('')}
      ${warn}
      <div class="row" style="margin-top:6px"><button type="button" class="btn sm secondary" data-useshelf>Usar ${shelf.hours} h</button>
      <details class="tiny muted grow"><summary>¿Cómo se calcula?</summary>Estimación orientativa: perecibilidad del producto según su tasa de respiración (clasificación de Kader), ajuste por el estado que declaras y por la temperatura prevista (regla Q10: el deterioro se acelera con el calor). Las horas base por tipo de producto son un supuesto del prototipo por calibrar con productores. No certifica inocuidad. ${forecast.source === 'open-meteo' ? e(WEATHER_CREDIT) : ''}</details></div>`;
  }

  // ---------- Cálculo y vista previa ----------
  function update() {
    const d = get();
    if (!start && (d.product || d.kg)) start = Date.now();
    localStorage.setItem(DRAFT, JSON.stringify({ ...d, declaration: false }));
    const g = kgToGrams(d.kg || 0);
    const ref = pesosToCents(d.ref_price || 0);
    const res = pesosToCents(d.rescue_price || 0);
    const ok = g > 0 && ref > 0 && res > 0 && res < ref;
    const t = orderTotals(g, ref, res);
    $('#calc').innerHTML = `<h3>Tu lote</h3>${ok ? `<dl>
      <dt>Valor a precio de siempre</dt><dd>${mxn(t.refTotal)}</dd>
      <dt>Valor de rescate</dt><dd>${mxn(t.rescueTotal)}</dd>
      <dt>Descuento para el comprador</dt><dd>${discountPct(ref, res)}%</dd>
      <dt class="total">Puedes recuperar hasta</dt><dd class="total">${mxn(t.rescueTotal)}</dd></dl>
      <p class="tiny" style="margin:8px 0 0;opacity:.85">Si no lo vendes, se pierde todo. Con el rescate recuperas ${t.refTotal ? Math.round((t.rescueTotal / t.refTotal) * 100) : 0}% de su valor habitual.</p>`
      : `<p style="margin:0;opacity:.9">${res >= ref && res > 0 ? '⚠️ El precio de rescate debe ser menor al de siempre.' : 'Llena kilos y precios para ver cuánto puedes recuperar.'}</p>`}`;
    const hours = Number(d.hours) || 24;
    $('#preview').innerHTML = lotCard({
      id: 0, product: d.product || 'Tu producto', photo, state: hours <= 6 ? 'por_vencer' : 'disponible', discount: ok ? discountPct(ref, res) : 0,
      rescue_price_c: res, ref_price_c: ref, producer: { name: user.business_name || user.name }, municipality_name: municipality(d.municipality)?.name || '', quality: d.quality,
      producer_transport: d.producer_transport, available_g: g || 1, total_g: g || 1, expires_at: Date.now() + hours * 3600e3,
    }, { owner: true });
    syncBlanks();
    if (d.municipality !== climateMuni) {
      climateMuni = d.municipality;
      loadClimate(); // el clima depende del municipio de recolección
    } else renderShelf();
  }

  // La frase para completar refleja el formulario (y viceversa) para que nunca se contradigan.
  function syncBlanks() {
    for (const b of $$('[data-s]', f)) {
      if (document.activeElement !== b) b.value = f[b.dataset.s].value;
      b.style.width = `${Math.max(b.placeholder.length, b.value.length, 2) + 1.5}ch`;
    }
  }

  /** Resumen usado por la confirmación del formulario y por el asistente de voz. */
  function summaryHtml(d) {
    const g = kgToGrams(d.kg || 0);
    const ref = pesosToCents(d.ref_price || 0);
    const res = pesosToCents(d.rescue_price || 0);
    const t = orderTotals(g, ref, res);
    const muni = municipality(d.municipality);
    return `<dl class="kv small" style="margin:8px 0">
      <dt>Producto</dt><dd>${e(d.product)}</dd>
      <dt>Cantidad</dt><dd>${e(d.kg)} kg${d.min_kg ? ` · mínimo ${e(d.min_kg)} kg` : ''}</dd>
      <dt>Precio</dt><dd>$${e(d.rescue_price)}/kg <s class="muted">$${e(d.ref_price)} habitual</s> · −${discountPct(ref, res)}%</dd>
      <dt>Frescura</dt><dd>${e(d.hours)} h${shelf ? ` <span class="muted">(estimado por clima ~${shelf.hours} h)</span>` : ''}</dd>
      <dt>Estado</dt><dd>${e(qualityLabel(d.quality) || 'Sin indicar')}</dd>
      <dt>Zona</dt><dd>${e(muni?.name || '')}${d.producer_transport ? ' · puedes llevarlo' : ''}</dd>
      <dt>Ingresos potenciales</dt><dd><strong>${mxn(t.rescueTotal)}</strong> <span class="muted">(valor habitual ${mxn(t.refTotal)}; ahorro para compradores ${mxn(t.savings)})</span></dd>
    </dl>`;
  }

  async function doPublish() {
    const body = { ...get(), photo, input_method: method, ref_source: refSource, shelf: shelf ? { ...shelf, source: forecast?.source } : null };
    const { lot } = await api('/api/lots', { method: 'POST', body });
    localStorage.removeItem(DRAFT);
    const secs = start ? Math.round((Date.now() - start) / 1000) : null;
    assistant.destroy();
    app.innerHTML = `<div class="wrap page" style="max-width:560px">
      <div class="ticket"><div class="ticket-head"><h1>¡Publicado! 🌱</h1><p style="margin:0">${secs ? `Lo hiciste en ${secs} segundos. ` : ''}Ya aparece en el tablero con su temporizador.</p></div>
      <div class="ticket-body stack">
        ${lotCard(lot, { owner: true })}
        <a class="btn wa big" target="_blank" rel="noopener" href="${waLink('', shareText(lot))}">📤 Compartir en mis grupos de WhatsApp</a>
        <div class="two"><a class="btn secondary" href="#/productor">Ir a mi panel</a><a class="btn ghost" href="#/publicar?nuevo=${Date.now()}">Publicar otro</a></div>
      </div></div></div>`;
    return lot;
  }

  async function publishMany(list) {
    const lotsBody = list.map((d) => {
      const est = forecast ? estimateShelfLife({ product: d.product, quality: d.quality, temps: forecast.temps, humidity: forecast.humidity }) : null;
      return { ...d, input_method: 'voz', shelf: est ? { ...est, source: forecast.source } : null };
    });
    const { lots } = await api('/api/lots/batch', { method: 'POST', body: { lots: lotsBody } });
    localStorage.removeItem(DRAFT);
    assistant.destroy();
    app.innerHTML = `<div class="wrap page" style="max-width:640px">
      <div class="ticket"><div class="ticket-head"><h1>¡${lots.length} ofertas publicadas! 🌱</h1><p style="margin:0">Cada producto tiene su propio temporizador.</p></div>
      <div class="ticket-body stack">
        <div class="grid">${lots.map((l) => lotCard(l, { owner: true })).join('')}</div>
        <a class="btn wa big" target="_blank" rel="noopener" href="${waLink('', lots.map(shareText).join('\n\n'))}">📤 Compartir todo por WhatsApp</a>
        <div class="two"><a class="btn secondary" href="#/productor">Ir a mi panel</a><a class="btn ghost" href="#/publicar?nuevo=${Date.now()}">Publicar otro</a></div>
      </div></div></div>`;
    return lots;
  }

  // ---------- Precio de mercado SNIIM ----------
  let refSource = 'declarado';
  let sniim = null;
  let sniimFor = null;
  let sniimTimer;
  async function loadSniim() {
    const box = $('#sniimBox');
    const p = f.product.value.trim();
    if (!box || !p || p === sniimFor) return;
    sniimFor = p;
    box.innerHTML = '<span class="tiny muted">Consultando precio SNIIM…</span>';
    try {
      const { price } = await api(`/api/market/${encodeURIComponent(p)}`);
      if (f.product.value.trim() !== p) return;
      sniim = price.available ? price : null;
      if (price.available) {
        box.innerHTML = `<div class="sniim-card"><span class="mono-tag">SNIIM</span>
          <div><strong>${mxn(price.freq_c)}/kg</strong> <span class="tiny muted">precio frecuente · ${e(price.variety)} · ${e(price.scope === 'morelia' ? price.market : price.market + ' (no hay dato de Morelia)')} · ${e(price.date || '')}</span></div>
          <button type="button" class="btn sm secondary" data-usesniim>Usar</button></div>
          <a class="tiny" href="${e(price.sniim_url)}" target="_blank" rel="noopener">Fuente: SNIIM, Secretaría de Economía</a>`;
      } else {
        box.innerHTML = `<span class="tiny muted">${e(price.reason)} <a href="${e(price.sniim_url)}" target="_blank" rel="noopener">Ver SNIIM</a></span>`;
        if (price.updating) { sniimFor = null; clearTimeout(sniimTimer); sniimTimer = setTimeout(loadSniim, 6000); }
      }
    } catch {
      box.innerHTML = '';
      sniimFor = null;
    }
  }

  // ---------- Foto: cámara primero, galería como respaldo; mismo formato 4:3 ----------
  function showPhoto() {
    const slot = $('#photoSlot');
    slot.innerHTML = photo ? `<img src="${photo}" alt="Foto del producto">` : '<span>📷</span><small>Foto real del producto (opcional)</small>';
    slot.classList.toggle('has', !!photo);
    $('#delPhoto').hidden = !photo;
    $('#camBtn').textContent = photo ? '📷 Tomar otra' : '📷 Tomar foto';
    update();
  }
  $('#camBtn').addEventListener('click', async () => {
    if (!canUseCamera()) return $('#photo').click();
    try {
      const shot = await takePhoto();
      if (shot) (photo = shot), showPhoto();
    } catch {
      toast('No se pudo abrir la cámara; elige una foto de tu teléfono');
      $('#photo').click();
    }
  });
  $('#galBtn').addEventListener('click', () => $('#photo').click());
  $('#delPhoto').addEventListener('click', () => { photo = null; showPhoto(); });

  // ---------- Asistente de voz ----------
  const formApi = { get, set, update, autoCategory, meta: { pending_prices: [] } };
  const estimate = (product, quality) => (forecast ? estimateShelfLife({ product, quality, temps: forecast.temps, humidity: forecast.humidity }) : null);
  const assistant = mountAssistant({
    form: formApi, user, summaryHtml, getShelf: () => shelf, estimate, publishMany,
    publish: () => { method = 'voz'; return doPublish(); },
    showForm: () => $('#formCard').scrollIntoView({ behavior: 'smooth' }),
  });
  onLeave(() => assistant.destroy());
  $('#openVA').addEventListener('click', () => assistant.open());

  // ---------- Eventos del formulario ----------
  f.addEventListener('input', (ev) => {
    const blank = ev.target.dataset?.s;
    if (blank) {
      set(blank, ev.target.value);
      method = 'frase';
    }
    if (ev.target.name === 'product' || blank === 'product') {
      autoCategory();
      clearTimeout(sniimTimer);
      sniimTimer = setTimeout(loadSniim, 500);
    }
    if (ev.target.name === 'ref_price' || blank === 'ref_price') refSource = 'declarado';
    update();
  });
  f.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-p],button[data-h],button[data-d],button[data-tpl],button[data-clima],button[data-useshelf],button[data-usesniim]');
    if (!b) return;
    if (b.dataset.p) (set('product', b.dataset.p), autoCategory(), loadSniim());
    if ('usesniim' in b.dataset && sniim) {
      set('ref_price', sniim.freq_c / 100);
      refSource = 'sniim';
      toast('Precio de referencia tomado del SNIIM', 'ok');
    }
    if (b.dataset.h) set('hours', b.dataset.h);
    if ('useshelf' in b.dataset && shelf) set('hours', shelf.hours);
    if (b.dataset.clima) forecast = manualForecast(Number(b.dataset.clima));
    if (b.dataset.d) {
      const ref = Number(String(f.ref_price.value).replace(',', '.'));
      if (!ref) return toast('Primero escribe tu precio de siempre', 'error');
      set('rescue_price', Math.round(ref * (1 - b.dataset.d / 100) * 2) / 2);
    }
    if (b.dataset.tpl) {
      const t = templates.find((x) => String(x.id) === b.dataset.tpl);
      Object.entries(t.payload).forEach(([k, val]) => set(k, val));
      toast(`Plantilla “${t.name}” cargada. Revisa kilos y horas.`);
    }
    update();
  });

  const writeBox = $('#writeBox');
  const toggle = $('#writeToggle');
  toggle.addEventListener('click', () => {
    writeBox.hidden = !writeBox.hidden;
    toggle.setAttribute('aria-expanded', String(!writeBox.hidden));
    toggle.textContent = writeBox.hidden ? '✍️ ¿Prefieres escribirlo aquí?' : 'Ocultar';
    if (!writeBox.hidden) (syncBlanks(), $('[data-s="kg"]', writeBox).focus());
  });

  $('#discard')?.addEventListener('click', () => {
    localStorage.removeItem(DRAFT);
    location.hash = '#/publicar?nuevo=' + Date.now();
  });

  $('#fill').addEventListener('click', () => {
    const text = $('#speech').value.trim();
    if (!text) return toast('Pega primero tu mensaje', 'error');
    if (parseMulti(text).length > 1) return assistant.open({ text }); // varios productos → se arman en el asistente
    const r = parseSpoken(text);
    for (const k of ['product', 'kg', 'rescue_price', 'ref_price', 'hours', 'quality', 'min_kg', 'municipality']) if (r[k] != null) set(k, r[k]);
    if (r.product) autoCategory();
    if (r.producer_transport) set('producer_transport', true);
    method = 'frase';
    update();
    const names = { product: 'producto', kg: 'kilos', rescue_price: 'precio de rescate', ref_price: 'precio de siempre', hours: 'horas', quality: 'estado del producto', pack_kg: 'kilos por caja' };
    if (r.unsafe) toast('Un producto podrido o no apto no se puede publicar como alimento', 'error');
    else toast(r.missing.length ? `Completa: ${r.missing.map((m) => names[m]).join(', ')}` : 'Listo. Revisa los datos y publica.', r.missing.length ? '' : 'ok');
  });

  $('#photo').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      photo = await standardizeFile(file);
      ev.target.value = '';
      showPhoto();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#saveTpl').addEventListener('click', async () => {
    const name = prompt('Nombre de la plantilla (ej. “Jitomate de los martes”)', f.product.value);
    if (!name) return;
    const { declaration, municipality: _m, ...payload } = get();
    try {
      await api('/api/templates', { method: 'POST', body: { name, payload } });
      toast('Plantilla guardada ⭐', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Confirmación obligatoria antes de publicar (también desde el formulario).
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = get();
    fieldErrors(f, {});
    const dlg = document.createElement('dialog');
    dlg.className = 'card confirm-dlg';
    dlg.innerHTML = `<h2 style="margin:0">¿Publicamos así?</h2>${summaryHtml(d)}
      ${d.declaration ? '' : '<div class="notice danger small">Falta marcar la declaración de que el producto es apto para consumo.</div>'}
      <div class="two" style="margin-top:10px"><button type="button" class="btn" data-go>✅ Sí, publicar</button><button type="button" class="btn secondary" data-back>✏️ Corregir</button></div>`;
    document.body.append(dlg);
    dlg.showModal();
    const closeDlg = () => (dlg.close(), dlg.remove());
    dlg.querySelector('[data-back]').addEventListener('click', closeDlg);
    dlg.querySelector('[data-go]').addEventListener('click', async (e2) => {
      e2.target.disabled = true;
      e2.target.textContent = 'Publicando…';
      try {
        await doPublish();
        closeDlg();
      } catch (err) {
        closeDlg();
        fieldErrors(f, err.fields);
        toast(err.status === 0 ? 'Sin conexión. Tu borrador está guardado; publícalo cuando tengas señal.' : err.message, 'error');
      }
    });
  });

  update();
  if (f.product.value) loadSniim();
}
