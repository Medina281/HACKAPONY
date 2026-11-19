import { api } from '../api.js';
import { onLeave } from '../app.js';
import { $, $$, e, mxn, toast, fieldErrors, shrinkImage, waLink, shareText } from '../ui.js';
import { PRODUCTS, QUALITY, CATEGORIES, normalize } from '../shared/catalog.js';
import { orderTotals, discountPct, kgToGrams, pesosToCents } from '../shared/calc.js';
import { parseSpoken } from '../shared/parse.js';
import { lotCard } from './components.js';

const DRAFT = 'rd_draft';
const QUICK = ['Jitomate', 'Aguacate', 'Fresa', 'Guayaba', 'Limón', 'Mango', 'Calabacita', 'Cebolla', 'Papa', 'Plátano'];

export default async function publish({ app, query, state }) {
  const user = state.user;
  let start = null;
  let photo = null;
  let initial = { quality: 'excedente', hours: '', allow_partial: true, pickup_point: user.pickup_point || '' };
  let source = '';

  const [{ templates }] = await Promise.all([api('/api/templates').catch(() => ({ templates: [] }))]);
  if (query.from) {
    const { lot } = await api(`/api/lots/${query.from}`);
    initial = {
      product: lot.product, category: lot.category, quality: lot.quality, kg: lot.total_g / 1000,
      min_kg: lot.min_g / 1000, allow_partial: lot.allow_partial, ref_price: lot.ref_price_c / 100,
      rescue_price: lot.original_rescue_price_c / 100, hours: lot.fresh_hours, pickup_point: lot.pickup_point || '',
      pickup_window: lot.pickup_window || '', producer_transport: lot.producer_transport, notes: lot.notes || '',
    };
    source = `Copiamos los datos de tu publicación anterior de ${e(lot.product)}. Revisa kilos, precio y horas.`;
  } else {
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

        <div class="card stack">
          <label for="speech">🎙️ Dímelo como lo dirías por WhatsApp <span class="muted small">(opcional)</span></label>
          <div class="row" style="flex-wrap:nowrap;align-items:stretch">
            <textarea id="speech" placeholder="Ej.: Tengo 100 kilos de jitomate a 12 pesos el kilo, normalmente lo vendo a 25, me quedan 24 horas" style="min-height:70px"></textarea>
            <button type="button" class="btn mic" id="mic" aria-label="Dictar con voz" title="Dictar con voz">🎤</button>
          </div>
          <button type="button" class="btn secondary" id="fill">✍️ Llenar el formulario con esto</button>
          <p class="tiny muted">Interpretación por reglas (no es IA). Siempre revisas antes de publicar.</p>
        </div>

        ${templates.length ? `<div><div class="small muted">Mis plantillas</div><div class="chips">${templates.map((t) => `<button type="button" class="chip" data-tpl="${t.id}">⭐ ${e(t.name)}</button>`).join('')}</div></div>` : ''}

        <div class="card">
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
            </div>
            <div class="field"><label for="rescue_price">4. Precio de rescate</label>
              <div class="input-unit"><input id="rescue_price" name="rescue_price" inputmode="decimal" value="${v('rescue_price')}" placeholder="12"><span>$/kg</span></div>
              <div class="chips" id="disc">${[30, 40, 50].map((d) => `<button type="button" class="chip" data-d="${d}">−${d}%</button>`).join('')}</div>
              <div class="err" data-for="rescue_price"></div>
            </div>
          </div>
          <div class="field"><label for="hours">5. ¿Cuántas horas le quedan para venderse fresco?</label>
            <div class="chips" id="hrs">${[6, 12, 24, 48, 72].map((h) => `<button type="button" class="chip" data-h="${h}">${h < 48 ? `${h} h` : `${h / 24} días`}</button>`).join('')}</div>
            <div class="input-unit"><input id="hours" name="hours" inputmode="decimal" value="${v('hours')}" placeholder="24"><span>horas</span></div>
            <div class="err" data-for="hours"></div>
          </div>
          <div class="field"><label>¿Cómo está el producto?</label>
            <div class="stack" id="quality">${QUALITY.map((q) => `<label class="inline-check"><input type="radio" name="quality" value="${q.id}" ${initial.quality === q.id ? 'checked' : ''}><span>${e(q.label)}<br><span class="tiny muted">${e(q.hint)}</span></span></label>`).join('')}</div>
            <div class="notice danger small" style="margin-top:8px">Si está podrido, golpeado con daño o no apto para consumo, <strong>no se publica</strong> para venta como alimento.</div>
            <div class="err" data-for="quality"></div>
          </div>
          <div class="field"><label class="inline-check"><input type="checkbox" name="declaration" id="declaration"><span>Declaro que el producto es <strong>apto para consumo humano</strong> y que la información es verdadera.</span></label><div class="err" data-for="declaration"></div></div>
        </div>

        <details class="more" ${initial.notes || initial.pickup_window ? 'open' : ''}><summary>Más detalles (opcional)</summary>
          <div class="field" style="margin-top:10px"><label for="photo">📷 Foto</label><input type="file" id="photo" accept="image/*" capture="environment"><div class="hint">Se reduce en tu teléfono antes de enviarse para gastar menos datos.</div><div class="err" data-for="photo"></div><img id="photoPrev" alt="" style="max-height:140px;border-radius:12px;margin-top:8px" hidden></div>
          <div class="two">
            <div class="field"><label for="min_kg">Compra mínima</label><div class="input-unit"><input id="min_kg" name="min_kg" inputmode="decimal" value="${v('min_kg')}" placeholder="1"><span>kg</span></div><div class="err" data-for="min_kg"></div></div>
            <div class="field"><label for="category">Categoría</label><select id="category" name="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${initial.category === c.id ? 'selected' : ''}>${e(c.label)}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label class="inline-check"><input type="checkbox" name="allow_partial" ${initial.allow_partial !== false ? 'checked' : ''}><span>Acepto vender por partes (no sólo el lote completo)</span></label></div>
          <div class="field"><label for="pickup_point">Punto de recolección</label><input id="pickup_point" name="pickup_point" value="${v('pickup_point')}" placeholder="Ej. Entrada del rancho, junto a la báscula"><div class="hint">Sólo lo verá quien aparte.</div></div>
          <div class="field"><label for="pickup_window">Horario para recoger</label><input id="pickup_window" name="pickup_window" value="${v('pickup_window')}" placeholder="Ej. 7:00 a 13:00"></div>
          <div class="field"><label class="inline-check"><input type="checkbox" name="producer_transport" ${initial.producer_transport ? 'checked' : ''}><span>Puedo llevarlo (con costo a acordar)</span></label></div>
          <div class="field"><label for="notes">Comentarios</label><textarea id="notes" name="notes" maxlength="400" placeholder="Ej. Ideal para salsa o aguas frescas">${v('notes')}</textarea></div>
        </details>

        <div class="sticky-cta"><button class="btn big" type="submit">🌱 Publicar ahora</button></div>
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
      rescue_price_c: res, ref_price_c: ref, producer: { name: user.business_name || user.name }, municipality_name: '', quality: d.quality,
      producer_transport: d.producer_transport, available_g: g || 1, total_g: g || 1, expires_at: Date.now() + hours * 3600e3,
    }, { owner: true }).replace('🏘️ </span>', '🏘️ Tu municipio</span>');
  }

  f.addEventListener('input', (ev) => {
    if (ev.target.name === 'product') autoCategory();
    update();
  });
  f.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-p],button[data-h],button[data-d],button[data-tpl]');
    if (!b) return;
    if (b.dataset.p) (set('product', b.dataset.p), autoCategory());
    if (b.dataset.h) set('hours', b.dataset.h);
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

  $('#discard')?.addEventListener('click', () => {
    localStorage.removeItem(DRAFT);
    location.hash = '#/publicar?nuevo=' + Date.now();
  });

  $('#fill').addEventListener('click', () => {
    const text = $('#speech').value.trim();
    if (!text) return toast('Escribe o dicta primero qué vendes', 'error');
    const r = parseSpoken(text);
    if (r.product) set('product', r.product), autoCategory();
    if (r.kg) set('kg', r.kg);
    if (r.refPrice) set('ref_price', r.refPrice);
    if (r.rescuePrice) set('rescue_price', r.rescuePrice);
    if (r.hours) set('hours', r.hours);
    update();
    const names = { product: 'producto', kg: 'kilos', rescuePrice: 'precio de rescate', refPrice: 'precio de siempre', hours: 'horas' };
    toast(r.missing.length ? `Revisa y completa: ${r.missing.map((m) => names[m]).join(', ')}` : 'Listo. Revisa los datos y publica.', r.missing.length ? '' : 'ok');
  });

  // Dictado por voz con Web Speech API (si el navegador lo soporta, p. ej. Chrome en Android).
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $('#mic');
  if (!SR) mic.hidden = true;
  else {
    let rec;
    mic.addEventListener('click', () => {
      if (rec) return rec.stop();
      rec = new SR();
      rec.lang = 'es-MX';
      rec.interimResults = true;
      mic.classList.add('rec');
      rec.onresult = (ev) => ($('#speech').value = [...ev.results].map((r) => r[0].transcript).join(' '));
      rec.onerror = () => toast('No se pudo usar el micrófono. Puedes escribirlo.', 'error');
      rec.onend = () => {
        mic.classList.remove('rec');
        rec = null;
        if ($('#speech').value) $('#fill').click();
      };
      rec.start();
    });
    onLeave(() => rec?.stop());
  }

  $('#photo').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      photo = await shrinkImage(file);
      $('#photoPrev').src = photo;
      $('#photoPrev').hidden = false;
      update();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#saveTpl').addEventListener('click', async () => {
    const name = prompt('Nombre de la plantilla (ej. “Jitomate de los martes”)', f.product.value);
    if (!name) return;
    const { declaration, ...payload } = get();
    try {
      await api('/api/templates', { method: 'POST', body: { name, payload } });
      toast('Plantilla guardada ⭐', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Publicando…';
    try {
      const body = { ...get(), photo };
      const { lot } = await api('/api/lots', { method: 'POST', body });
      localStorage.removeItem(DRAFT);
      const secs = start ? Math.round((Date.now() - start) / 1000) : null;
      app.innerHTML = `<div class="wrap page" style="max-width:560px">
        <div class="ticket"><div class="ticket-head"><h1>¡Publicado! 🌱</h1><p style="margin:0">${secs ? `Lo hiciste en ${secs} segundos. ` : ''}Ya aparece en el tablero con su temporizador.</p></div>
        <div class="ticket-body stack">
          ${lotCard(lot, { owner: true })}
          <a class="btn wa big" target="_blank" rel="noopener" href="${waLink('', shareText(lot))}">📤 Compartir en mis grupos de WhatsApp</a>
          <div class="two"><a class="btn secondary" href="#/productor">Ir a mi panel</a><a class="btn ghost" href="#/publicar?nuevo=${Date.now()}">Publicar otro</a></div>
        </div></div></div>`;
    } catch (err) {
      fieldErrors(f, err.fields);
      toast(err.status === 0 ? 'Sin conexión. Tu borrador está guardado; publícalo cuando tengas señal.' : err.message, 'error');
      btn.disabled = false;
      btn.textContent = '🌱 Publicar ahora';
    }
  });

  update();
}
