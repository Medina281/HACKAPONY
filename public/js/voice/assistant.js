// Asistente de Publicación por Voz — conversación estilo WhatsApp.
// · Un dictado puede traer varios productos ("jitomate y cebolla") → se publican como lotes separados.
// · Lo que falte se pide en UNA sola tarjeta por producto (menos preguntas, menos tiempo).
// · No inventa datos y nunca publica sin confirmación explícita.
import { $, e, toast, mxn, stripIcons } from '../ui.js';
import { parseMulti, parseSpoken, resolvePacks, VAGUE_LABEL, asOwnPrice } from '../shared/parse.js';
import { priceFor, TIERS } from '../shared/pricing.js';
import { QUALITY, PRODUCTS, municipality, qualityLabel } from '../shared/catalog.js';
import { orderTotals, kgToGrams, pesosToCents, discountPct } from '../shared/calc.js';
import { createRecognizer, canRecognize, brokenRecognizer, isAndroid, canSpeak, speak, stopSpeaking, ERROR_TEXT } from './speech.js';

const QUICK = ['Jitomate', 'Aguacate', 'Fresa', 'Guayaba', 'Limón', 'Mango', 'Cebolla', 'Papa'];
const MIC_OK = 'rd_mic_ok';
const MUTE = 'rd_tts_mute';
const LABEL = { product: 'Producto', kg: 'Kilos', rescue_price: 'Precio de rescate ($/kg)', ref_price: 'Tu precio por kilo ($)', quality: 'Estado', hours: 'Horas de frescura', pack_kg: 'Kilos por empaque' };
const num = (x) => Number(String(x ?? '').replace(',', '.')) || 0;

/** Borrador en memoria para cuando el dictado trae varios productos. */
function memDraft(base = {}) {
  const d = { ...base };
  return { get: () => ({ ...d }), set: (k, v) => { if (v != null) d[k] = v; }, update() {}, autoCategory() {}, meta: { pending_prices: [] } };
}

export function mountAssistant(ctx) {
  const { form, user } = ctx;
  const st = { items: null, cur: 0, recording: false, startedAt: 0, mute: localStorage.getItem(MUTE) === '1' || !canSpeak, sendOnEnd: false, lastAsk: null };
  form.meta ||= { pending_prices: [] };

  const root = document.createElement('div');
  root.className = 'va';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Asistente de publicación por voz');
  root.innerHTML = `
    <div class="va-panel">
      <header class="va-head">
        <button type="button" class="va-icon" data-x aria-label="Cerrar asistente">←</button>
        <div class="va-avatar" aria-hidden="true"><svg class="i" aria-hidden="true"><use href="/icons.svg#sprout"/></svg></div>
        <div class="grow"><strong>Asistente Raíz Directa</strong><div class="tiny" id="vaStatus">te ayudo a publicar</div></div>
        <button type="button" class="va-icon" id="vaMute" aria-label="Activar o silenciar la voz del asistente" ${canSpeak ? '' : 'hidden'}>${st.mute ? '<svg class="i" aria-hidden="true"><use href="/icons.svg#mute"/></svg>' : '<svg class="i" aria-hidden="true"><use href="/icons.svg#volume"/></svg>'}</button>
      </header>
      <div class="va-msgs" id="vaMsgs" aria-live="polite"></div>
      <div class="va-chips" id="vaChips"></div>
      <div class="va-composer" id="vaComposer">
        <input id="vaText" placeholder="Escribe un mensaje" autocomplete="off" aria-label="Escribe tu respuesta">
        <button type="button" class="va-round" id="vaSend" aria-label="Enviar" hidden><svg class="i" aria-hidden="true"><use href="/icons.svg#send"/></svg></button>
        <button type="button" class="va-round" id="vaMic" aria-label="Tocar para hablar" ${canRecognize ? '' : 'hidden'}><svg class="i" aria-hidden="true"><use href="/icons.svg#mic"/></svg></button>
      </div>
      <div class="va-live" id="vaLive" hidden>Habla ahora…</div>
      <div class="va-recbar" id="vaRec" hidden>
        <button type="button" class="va-icon" id="vaCancel" aria-label="Cancelar grabación"><svg class="i" aria-hidden="true"><use href="/icons.svg#trash"/></svg></button>
        <span class="va-dot" aria-hidden="true"></span><span id="vaTime">0:00</span>
        <span class="va-wave" aria-hidden="true">${'<i></i>'.repeat(14)}</span>
        <button type="button" class="va-round" id="vaStop" aria-label="Terminar y enviar"><svg class="i" aria-hidden="true"><use href="/icons.svg#send"/></svg></button>
      </div>
    </div>`;
  document.body.append(root);
  const msgs = $('#vaMsgs', root);
  const chips = $('#vaChips', root);
  const text = $('#vaText', root);
  const status = $('#vaStatus', root);

  // ---------- Mensajes ----------
  function bot(html, say) {
    const b = document.createElement('div');
    b.className = 'va-msg bot';
    b.innerHTML = html;
    msgs.append(b);
    msgs.scrollTop = msgs.scrollHeight;
    if (say && !st.mute) speak(say);
    return b;
  }
  function me(value, { voice, secs } = {}) {
    const b = document.createElement('div');
    b.className = 'va-msg me';
    b.innerHTML = `${voice ? `<div class="va-note"><svg class="i" aria-hidden="true"><use href="/icons.svg#mic"/></svg> ${secs}s · nota de voz transcrita</div>` : ''}<span class="va-t">${e(value)}</span><span class="va-check">✓✓</span>`;
    msgs.append(b);
    msgs.scrollTop = msgs.scrollHeight;
    return b;
  }
  function setChips(list = []) {
    chips.innerHTML = list.map((c, i) => `<button type="button" class="chip" data-i="${i}">${e(stripIcons(c.label))}</button>`).join('');
    chips.onclick = (ev) => {
      const b = ev.target.closest('[data-i]');
      if (b) list[Number(b.dataset.i)].run();
    };
  }

  // ---------- Borradores ----------
  const drafts = () => st.items || [form];
  const cur = () => drafts()[st.cur];
  const multi = () => !!st.items && st.items.length > 1;
  const nameOf = (dr) => dr.get().product || 'el producto';

  function missingOf(dr) {
    const d = dr.get();
    const m = [];
    if (dr.meta.packs && !dr.meta.pack_kg) m.push('pack_kg');
    if (!d.product) m.push('product');
    if (!num(d.kg) && !dr.meta.packs) m.push('kg');
    if (!num(d.ref_price) && !dr.meta.pending_prices.some((p) => p.field === 'ref_price')) m.push('ref_price');
    if (!d.quality) m.push('quality');
    if (!num(d.hours)) m.push('hours');
    return m;
  }

  // El precio de rescate lo calcula la app a partir del precio del agricultor (regla automática).
  function syncRescue(dr) {
    const ref = Math.round(num(dr.get().ref_price) * 100);
    dr.set('rescue_price', ref >= 100 ? priceFor(ref, TIERS[0].off) / 100 : '');
  }

  function applyTo(dr, r) {
    r = asOwnPrice(r);
    if (r.unsafe) bot('<svg class="i" aria-hidden="true"><use href="/icons.svg#alert"/></svg> Si está podrido o no es apto para consumo, <strong>no se puede publicar</strong> como alimento.', 'Si está podrido o no es apto, no se puede publicar como alimento.');
    const set = (k, v) => v != null && dr.set(k, v);
    set('product', r.product);
    if (r.product) dr.autoCategory();
    if (r.packs) Object.assign(dr.meta, { packs: r.packs, pack_unit: r.pack_unit, pack_kg: r.pack_kg ?? dr.meta.pack_kg });
    if (r.pack_kg && !r.packs) dr.meta.pack_kg = r.pack_kg;
    if (r.pending_prices?.length) dr.meta.pending_prices = r.pending_prices;
    const conv = resolvePacks(dr.meta);
    if (conv.kg) set('kg', conv.kg);
    if (conv.rescue_price || conv.ref_price) dr.meta.pending_prices = [];
    set('rescue_price', conv.rescue_price ?? r.rescue_price);
    set('ref_price', conv.ref_price ?? r.ref_price);
    if (r.kg != null && !r.packs) set('kg', r.kg);
    if (r.hours != null) (set('hours', r.hours), (dr.meta.vague = null));
    else if (r.hours_vague) dr.meta.vague = r.hours_vague;
    set('quality', r.quality);
    set('min_kg', r.min_kg);
    if (r.producer_transport) dr.set('producer_transport', true);
    if (r.municipality) for (const x of drafts()) x.set('municipality', r.municipality);
    syncRescue(dr);
    dr.update();
    return conv;
  }

  function summaryLine(dr) {
    const d = dr.get();
    const parts = [`<strong>${e(d.product || '¿producto?')}</strong>`];
    if (num(d.kg)) parts.push(`${e(d.kg)} kg`);
    if (num(d.ref_price)) parts.push(`tu precio $${e(d.ref_price)}/kg${num(d.rescue_price) ? ` (en la app desde $${e(d.rescue_price)})` : ''}`);
    if (num(d.hours)) parts.push(`${e(d.hours)} h`);
    if (d.quality) parts.push(e(qualityLabel(d.quality)));
    return parts.join(' · ');
  }

  // ---------- Una tarjeta con TODO lo que falta (sin tanta pregunta) ----------
  function askMissing() {
    const dr = cur();
    const miss = missingOf(dr);
    const d = dr.get();
    st.lastAsk = miss[0];
    const shelf = d.product && d.quality ? ctx.estimate(d.product, d.quality) : null;
    const prefix = multi() ? `Producto ${st.cur + 1} de ${st.items.length} — ` : '';
    const vague = dr.meta.vague ? ` Dijiste “${e(VAGUE_LABEL[dr.meta.vague] || dr.meta.vague)}”; dime un número de horas.` : '';
    const field = (k) => {
      if (k === 'product') return `<div class="mf"><span>${LABEL[k]}</span><div class="chips">${QUICK.map((n) => `<button type="button" class="chip" data-set="product" data-v="${n}">${n}</button>`).join('')}</div><input data-in="product" list="plist" placeholder="Otro producto"></div>`;
      if (k === 'quality') return `<div class="mf"><span>${LABEL[k]}</span><div class="chips">${QUALITY.map((q) => `<button type="button" class="chip" data-set="quality" data-v="${q.id}">${e(q.label)}</button>`).join('')}</div></div>`;
      if (k === 'hours') return `<div class="mf"><span>${LABEL[k]}</span><div class="chips">${shelf ? `<button type="button" class="chip" data-set="hours" data-v="${shelf.hours}"><svg class="i" aria-hidden="true"><use href="/icons.svg#thermo"/></svg> ~${shelf.hours} h por clima</button>` : ''}${[12, 24, 48].map((h) => `<button type="button" class="chip" data-set="hours" data-v="${h}">${h} h</button>`).join('')}</div><input data-in="hours" inputmode="decimal" placeholder="o escribe las horas"></div>`;
      if (k === 'pack_kg') return `<div class="mf"><span>¿Cuántos kilos pesa cada ${e(dr.meta.pack_unit || 'empaque')}?</span><input data-in="pack_kg" inputmode="decimal" placeholder="kg"></div>`;
      const sug = k === 'rescue_price' && num(d.ref_price) ? [30, 40, 50].map((p) => { const v = Math.round(num(d.ref_price) * (1 - p / 100) * 2) / 2; return `<button type="button" class="chip" data-set="rescue_price" data-v="${v}">$${v} (−${p}%)</button>`; }).join('') : '';
      return `<div class="mf"><span>${LABEL[k]}</span>${sug ? `<div class="chips">${sug}</div>` : ''}<input data-in="${k}" inputmode="decimal" placeholder="${k === 'kg' ? '100' : '$'}"></div>`;
    };
    const card = bot(`${prefix}${summaryLine(dr)}<div class="small muted" style="margin:6px 0">Me falta:${vague}</div>
      <div class="mf-wrap">${miss.map(field).join('')}</div>
      <button type="button" class="btn sm block" data-ok style="margin-top:8px">Listo</button>`,
      `${multi() ? `Para ${nameOf(dr)}, ` : ''}me falta ${miss.map((k) => LABEL[k].replace(/ \(.*\)/, '').toLowerCase()).join(', ')}. Puedes decirlo o tocar las opciones.`);
    card.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-set]');
      if (!b) return;
      card.querySelectorAll(`[data-set="${b.dataset.set}"]`).forEach((x) => x.classList.toggle('on', x === b));
      const inp = card.querySelector(`[data-in="${b.dataset.set}"]`);
      if (inp) inp.value = b.dataset.v;
      else card.dataset[b.dataset.set] = b.dataset.v;
    });
    card.querySelector('[data-ok]').addEventListener('click', () => {
      const vals = {};
      card.querySelectorAll('[data-in]').forEach((i) => { if (i.value.trim()) vals[i.dataset.in] = i.value.trim(); });
      if (card.dataset.quality) vals.quality = card.dataset.quality;
      if (!Object.keys(vals).length) return toast('Llena o elige al menos un dato');
      me(Object.entries(vals).map(([k, v]) => `${LABEL[k].replace(/ \(.*\)/, '')}: ${k === 'quality' ? qualityLabel(v) : v}`).join(' · '));
      if (vals.pack_kg) { dr.meta.pack_kg = num(vals.pack_kg); delete vals.pack_kg; }
      for (const [k, v] of Object.entries(vals)) dr.set(k, v);
      if (vals.product) dr.autoCategory();
      if (vals.hours) dr.meta.vague = null;
      const conv = resolvePacks(dr.meta);
      if (conv.kg) dr.set('kg', conv.kg);
      if (conv.rescue_price) dr.set('rescue_price', conv.rescue_price);
      if (conv.ref_price) dr.set('ref_price', conv.ref_price);
      if (conv.rescue_price || conv.ref_price) dr.meta.pending_prices = [];
      syncRescue(dr);
      dr.update();
      card.querySelector('[data-ok]').disabled = true;
      next();
    });
    setChips(multi() ? [{ label: `Quitar ${nameOf(dr)}`, run: () => removeItem(st.cur) }] : []);
  }

  function removeItem(i) {
    const n = nameOf(st.items[i]);
    st.items.splice(i, 1);
    bot(`Quité ${e(n)}.`);
    if (!st.items.length) { st.items = null; st.cur = 0; return bot('No quedan productos. Dime qué quieres vender.'); }
    if (st.items.length === 1) { // volver a un solo producto: se pasa al formulario
      const only = st.items[0].get();
      for (const [k, v] of Object.entries(only)) form.set(k, v);
      form.update();
      st.items = null;
    }
    st.cur = 0;
    next();
  }

  function next() {
    const idx = drafts().findIndex((dr) => missingOf(dr).length);
    if (idx >= 0) { st.cur = idx; return askMissing(); }
    confirmStep();
  }

  function answer(input, meta) {
    if (!input.trim()) return;
    me(input, meta);
    chips.innerHTML = '';
    const firstTurn = !st.items && !form.get().product;
    const results = parseMulti(input);
    if (results.length > 1 && (firstTurn || st.items)) {
      // Varios productos: un borrador por producto (se conservan datos generales del formulario)
      const base = form.get();
      const common = { municipality: base.municipality, pickup_point: base.pickup_point, pickup_window: base.pickup_window, allow_partial: true, producer_transport: base.producer_transport };
      const existing = st.items || [];
      st.items = [...existing];
      for (const r of results) {
        let dr = st.items.find((x) => x.get().product === r.product);
        if (!dr) { dr = memDraft({ ...common }); dr.autoCategory = () => dr.set('category', PRODUCTS.find((p) => p.name === dr.get().product)?.category || 'otro'); st.items.push(dr); }
        applyTo(dr, r);
      }
      bot(`Entendí <strong>${st.items.length} productos</strong>; cada uno se publica como oferta separada:<br>${st.items.map((dr) => `• ${summaryLine(dr)}`).join('<br>')}`,
        `Entendí ${st.items.length} productos: ${st.items.map(nameOf).join(' y ')}.`);
    } else {
      const r = st.lastAsk && results.length === 1 ? parseSpoken(input, { context: st.lastAsk }) : results[0];
      const conv = applyTo(cur(), r);
      const d = cur().get();
      const said = [];
      if (r.product) said.push(d.product);
      if (conv.kg) said.push(`${cur().meta.packs} ${cur().meta.pack_unit}s × ${cur().meta.pack_kg} kg = <strong>${conv.kg} kg</strong>`);
      else if (r.kg != null) said.push(`${d.kg} kg${r.approx ? ' (aprox.)' : ''}`);
      if (conv.ref_price || r.ref_price != null || r.rescue_price != null) said.push(`tu precio $${d.ref_price}/kg${conv.ref_price ? ' (convertido del precio por empaque)' : ''} → en la app desde $${d.rescue_price}`);
      if (r.hours != null) said.push(`${d.hours} h`);
      if (r.quality) said.push(qualityLabel(d.quality));
      if (r.municipality) said.push(`en ${municipality(r.municipality).name}`);
      if (said.length) bot(`Anoté: ${said.join(' · ')}`);
      else if (!r.unsafe) bot('No logré entender un dato. Dilo de otra forma o usa las opciones.', 'No logré entenderte.');
    }
    next();
  }

  // ---------- Confirmación obligatoria ----------
  function confirmStep() {
    st.lastAsk = null;
    const list = drafts();
    let totalRef = 0;
    let totalRes = 0;
    const rows = list.map((dr) => {
      const d = dr.get();
      const t = orderTotals(kgToGrams(d.kg), pesosToCents(d.ref_price), pesosToCents(d.rescue_price));
      totalRef += t.refTotal;
      totalRes += t.rescueTotal;
      return multi() ? `<div class="va-item">${summaryLine(dr)} · −${discountPct(pesosToCents(d.ref_price), pesosToCents(d.rescue_price))}%<br><span class="tiny muted">Puedes recuperar ${mxn(t.rescueTotal)}</span></div>` : ctx.summaryHtml(d);
    }).join('');
    const muni = municipality(list[0].get().municipality);
    const b = bot(`<strong>Revisa antes de publicar${multi() ? ` (${list.length} ofertas)` : ''}:</strong>${rows}
      ${multi() && ctx.hasPhoto?.() ? `<div class="tiny muted"><svg class="i" aria-hidden="true"><use href="/icons.svg#camera"/></svg> Tu foto se usará para ${e(nameOf(list[0]))}.</div>` : ''}
      ${multi() ? `<div class="small" style="margin-top:6px">Zona: ${e(muni?.name || '')} · Total que puedes recuperar: <strong>${mxn(totalRes)}</strong> <span class="muted">(a tu precio ${mxn(totalRef)})</span></div>` : ''}
      <label class="inline-check va-decl"><input type="checkbox" data-decl ${form.get().declaration ? 'checked' : ''}><span>Declaro que ${multi() ? 'todos son' : 'es'} <strong>aptos para consumo humano</strong> y la información es verdadera.</span></label>
      <div class="two" style="margin-top:10px"><button type="button" class="btn" data-pub><svg class="i" aria-hidden="true"><use href="/icons.svg#check-circle"/></svg> Publicar</button><button type="button" class="btn secondary" data-fix><svg class="i" aria-hidden="true"><use href="/icons.svg#edit"/></svg> Corregir</button></div>`,
      multi() ? `Vas a publicar ${list.length} productos: ${list.map(nameOf).join(' y ')}. Revisa y confirma.` : `Vas a publicar ${list[0].get().kg} kilos de ${list[0].get().product} con tu precio de ${list[0].get().ref_price} pesos el kilo; en la app empieza en ${list[0].get().rescue_price} y baja solo. Revisa y confirma.`);
    $('[data-decl]', b).addEventListener('change', (ev) => form.set('declaration', ev.target.checked));
    $('[data-fix]', b).addEventListener('click', fixMenu);
    $('[data-pub]', b).addEventListener('click', async (ev) => {
      if (!$('[data-decl]', b).checked) return toast('Marca la declaración de que el producto es apto para consumo', 'error');
      ev.target.disabled = true;
      ev.target.textContent = 'Publicando…';
      try {
        if (multi()) await ctx.publishMany(list.map((dr) => ({ ...dr.get(), declaration: true })));
        else await ctx.publish();
        stopSpeaking();
        if (!st.mute) speak(multi() ? 'Listo. Tus ofertas ya están publicadas.' : 'Listo. Tu oferta ya está publicada.');
        close();
      } catch (err) {
        ev.target.disabled = false;
        ev.target.innerHTML = '<svg class="i" aria-hidden="true"><use href="/icons.svg#check-circle"/></svg> Publicar';
        bot(`No se pudo publicar: ${e(err.message)}`, `No se pudo publicar. ${err.message}`);
        const f = Object.keys(err.fields || {}).find((k) => LABEL[k]);
        if (f) {
          if (multi() && Number.isInteger(err.fields.index)) st.cur = err.fields.index;
          cur().set(f, '');
          askMissing();
        }
      }
    });
    setChips([{ label: '<svg class="i" aria-hidden="true"><use href="/icons.svg#edit"/></svg> Corregir algo', run: fixMenu }]);
  }

  function fixMenu() {
    bot('Dime qué cambiar (por ejemplo: “no, son 80 kilos”) o elige:', '¿Qué quieres cambiar?');
    const opts = [];
    drafts().forEach((dr, i) => {
      for (const [f, l] of [['kg', 'kilos'], ['rescue_price', 'precio'], ['hours', 'horas'], ['quality', 'estado']]) {
        opts.push({ label: `${multi() ? nameOf(dr) + ': ' : ''}${l}`, run: () => { st.cur = i; dr.set(f, ''); dr.update(); askMissing(); } });
      }
      if (multi()) opts.push({ label: `Quitar ${nameOf(dr)}`, run: () => removeItem(i) });
    });
    if (!multi()) opts.push({ label: '<svg class="i" aria-hidden="true"><use href="/icons.svg#edit"/></svg> Ver formulario', run: () => { close(); ctx.showForm(); } });
    setChips(opts);
  }

  // ---------- Grabación: tocar para hablar, tocar para enviar ----------
  // Todo tiene salida: el botón Enviar y el de Cancelar siempre regresan la pantalla a la normalidad,
  // aunque el navegador nunca avise que terminó (pasa en algunos teléfonos y navegadores).
  const live = $('#vaLive', root);
  let tick = null;
  let watchdog = null;
  let forceEnd = null;
  function noVoiceHelp() {
    return isAndroid || /iPhone|iPad/i.test(navigator.userAgent)
      ? 'Tu navegador no está convirtiendo la voz en texto. Abre la página en <strong>Chrome</strong> (Android) o <strong>Safari</strong> (iPhone), o toca la caja de texto y usa el <strong>micrófono de tu teclado</strong>.'
      : 'Este navegador no está convirtiendo la voz en texto (pasa en Opera, Brave y Firefox). Abre la página en <strong>Chrome</strong> o <strong>Edge</strong>, o escríbeme.';
  }
  // De las lecturas que propone el navegador, se usa la que más datos permite entender.
  function bestReading(first, alts) {
    const score = (t) => parseMulti(t).reduce((n, r) => n + ['product', 'kg', 'rescue_price', 'ref_price', 'quality', 'hours'].filter((k) => r[k] != null).length, 0)
      + (st.lastAsk ? Object.values(parseSpoken(t, { context: st.lastAsk })).filter((v) => v != null && v !== false && !Array.isArray(v)).length * 0.1 : 0);
    let best = first;
    let top = first ? score(first) : -1;
    for (const a of alts) { const sc = score(a); if (sc > top) { top = sc; best = a; } }
    return best;
  }
  function finish(send) {
    if (!st.recording) return;
    clearTimeout(watchdog);
    clearTimeout(forceEnd);
    const secs = Math.max(1, Math.round((Date.now() - st.startedAt) / 1000));
    const t = (st.finalText || st.liveText || '').trim();
    recUI(false);
    if (!send) return;
    if (t) answer(t, { voice: true, secs });
    else if (!st.errorShown) bot('No alcancé a escuchar nada. Toca el micrófono y habla cerca del teléfono, o escríbeme.', 'No alcancé a escucharte.');
  }
  function startRec() {
    if (st.recording) return;
    if (!navigator.onLine) return bot('Sin internet el dictado no funciona. Escríbeme; yo lleno los datos.');
    stopSpeaking();
    st.finalText = '';
    st.liveText = '';
    st.errorShown = false;
    st.heard = false;
    st.rec = createRecognizer({
      onText: (t) => {
        st.heard = true;
        st.liveText = t;
        live.textContent = t || 'Habla ahora…';
      },
      onError: (code) => {
        const m = code === 'network' || code === 'service-not-allowed' ? null : ERROR_TEXT[code];
        if (m) { st.errorShown = true; bot(e(m), m); }
        if (code === 'network' || code === 'service-not-allowed') { st.errorShown = true; bot(noVoiceHelp()); }
        if (code !== 'no-speech' && code !== 'aborted') finish(false);
      },
      onEnd: (finalText, alts = []) => {
        st.finalText = bestReading(finalText, alts);
        finish(true);
      },
    });
    try {
      st.rec.start();
    } catch {
      return bot('No pude iniciar el micrófono. Escríbeme tu respuesta.');
    }
    st.startedAt = Date.now();
    recUI(true);
    // Si en 8 s no llega nada de texto, el navegador no está transcribiendo: se avisa y se libera la pantalla.
    watchdog = setTimeout(() => {
      if (st.recording && !st.heard) {
        st.rec.cancel();
        st.errorShown = true;
        finish(false);
        bot(noVoiceHelp());
        text.focus();
      }
    }, 8000);
  }
  function stopRec(send = true) {
    if (!st.recording) return;
    if (!send) { st.rec.cancel(); return finish(false); }
    st.rec.stop();
    // El navegador debería avisar que terminó; si no lo hace en 1.5 s, se envía lo que ya se escuchó.
    forceEnd = setTimeout(() => finish(true), 1500);
  }
  function recUI(on) {
    st.recording = on;
    $('#vaRec', root).hidden = !on;
    live.hidden = !on;
    if (on) live.textContent = isAndroid ? 'Habla ahora… se envía solo al terminar' : 'Habla ahora… y toca enviar';
    $('#vaComposer', root).hidden = on;
    status.textContent = on ? 'escuchando…' : 'te ayudo a publicar';
    clearInterval(tick);
    if (on) tick = setInterval(() => {
      const s = Math.floor((Date.now() - st.startedAt) / 1000);
      $('#vaTime', root).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 60) stopRec(true);
    }, 250);
    else $('#vaTime', root).textContent = '0:00';
  }

  const mic = $('#vaMic', root);
  mic.addEventListener('click', () => (localStorage.getItem(MIC_OK) ? startRec() : explainMic()));
  $('#vaStop', root).addEventListener('click', () => stopRec(true));
  $('#vaCancel', root).addEventListener('click', () => { stopRec(false); toast('Grabación cancelada'); });

  function explainMic() {
    const b = bot(`<strong><svg class="i" aria-hidden="true"><use href="/icons.svg#mic"/></svg> Antes de usar el micrófono</strong>
      <ul class="small" style="margin:6px 0;padding-left:18px">
        <li>Tu teléfono te pedirá permiso para usar el micrófono.</li>
        <li>El dictado lo hace tu navegador; en Chrome la voz se procesa en servidores de Google.</li>
        <li>Raíz Directa <strong>no graba ni guarda tu audio</strong> ni la transcripción.</li>
        <li>Nada se publica sin que tú lo confirmes.</li>
      </ul>
      <div class="two"><button type="button" class="btn sm" data-ok>Entendido</button><button type="button" class="btn ghost sm" data-no>Mejor escribo</button></div>`,
      'Antes de usar el micrófono: no guardamos tu audio y nada se publica sin tu confirmación.');
    $('[data-ok]', b).addEventListener('click', () => { localStorage.setItem(MIC_OK, '1'); b.querySelector('.two').remove(); bot(`Listo. Toca <strong>el micrófono</strong>, habla y ${isAndroid ? 'al terminar de hablar se envía solo' : 'toca <strong>enviar</strong>'}.`); startRec(); });
    $('[data-no]', b).addEventListener('click', () => { b.querySelector('.two').remove(); text.focus(); });
  }

  text.addEventListener('input', () => {
    $('#vaSend', root).hidden = !text.value.trim();
    mic.hidden = !canRecognize || !!text.value.trim();
  });
  const sendText = () => { const t = text.value; text.value = ''; text.dispatchEvent(new Event('input')); answer(t); };
  text.addEventListener('keydown', (ev) => ev.key === 'Enter' && (ev.preventDefault(), sendText()));
  $('#vaSend', root).addEventListener('click', sendText);
  $('#vaMute', root).addEventListener('click', (ev) => {
    st.mute = !st.mute;
    localStorage.setItem(MUTE, st.mute ? '1' : '0');
    ev.currentTarget.innerHTML = st.mute ? '<svg class="i" aria-hidden="true"><use href="/icons.svg#mute"/></svg>' : '<svg class="i" aria-hidden="true"><use href="/icons.svg#volume"/></svg>';
    if (st.mute) stopSpeaking();
  });
  root.querySelector('[data-x]').addEventListener('click', () => close());

  function open({ text: preset } = {}) {
    root.hidden = false;
    document.body.classList.add('va-open');
    if (!msgs.children.length) {
      const muni = municipality(form.get().municipality || user.municipality);
      bot(canRecognize
        ? `Hola, ${e(user.name.split(' ')[0])}. Dime qué vendes, como en un mensaje de voz. Puedes decir varios productos: <em>“100 kilos de jitomate a 25 el kilo, en buen estado, aguanta un día, y 50 de cebolla a 15…”</em> El precio de rescate lo pongo yo.`
        : `Hola, ${e(user.name.split(' ')[0])}. ${brokenRecognizer ? 'Este navegador no convierte la voz en texto; para dictar ábrelo en <strong>Chrome</strong>, <strong>Edge</strong> o <strong>Safari</strong>.' : 'Este navegador no permite dictar.'} Aquí puedes <strong>escribirme</strong> como en WhatsApp, también varios productos a la vez.`,
        canRecognize ? 'Hola. Dime qué quieres vender.' : '');
      bot(`<span class="tiny muted">Zona: ${e(muni?.name || '')} (de tu perfil; puedes decir otra).</span>`);
    }
    if (preset) answer(preset);
    else if (form.get().product) setTimeout(next, 200);
    if (canRecognize && !localStorage.getItem(MIC_OK) && !preset) explainMic();
    setTimeout(() => (canRecognize ? mic : text).focus(), 50);
  }
  function close() {
    if (st.recording) stopRec(false);
    stopSpeaking();
    root.hidden = true;
    document.body.classList.remove('va-open');
  }
  // Si el usuario regresa con el botón Atrás del teléfono, se cierra el asistente (no se queda encima de la página).
  const onNav = () => { if (!root.hidden) close(); };
  window.addEventListener('hashchange', onNav);
  return { open, close, destroy: () => { close(); window.removeEventListener('hashchange', onNav); root.remove(); } };
}
