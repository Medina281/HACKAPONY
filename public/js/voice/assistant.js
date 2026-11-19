// Asistente de Publicación por Voz — conversación estilo WhatsApp que llena el formulario existente.
// Reglas: no inventa datos (lo que falta se pregunta), y nunca publica sin confirmación explícita.
import { $, $$, e, toast } from '../ui.js';
import { parseSpoken, resolvePacks, VAGUE_LABEL } from '../shared/parse.js';
import { QUALITY, PRODUCTS, municipality } from '../shared/catalog.js';
import { createRecognizer, canRecognize, canSpeak, speak, stopSpeaking, ERROR_TEXT } from './speech.js';

const QUICK = ['Jitomate', 'Aguacate', 'Fresa', 'Guayaba', 'Limón', 'Mango', 'Cebolla', 'Papa'];
const MIC_OK = 'rd_mic_ok';
const MUTE = 'rd_tts_mute';

export function mountAssistant(ctx) {
  const { form, user } = ctx;
  const st = { asking: null, packs: null, pack_unit: null, pack_kg: null, pending_prices: [], vague: null, rec: null, recording: false, startedAt: 0, mute: localStorage.getItem(MUTE) === '1' || !canSpeak };

  const root = document.createElement('div');
  root.className = 'va';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Asistente de publicación por voz');
  root.innerHTML = `
    <div class="va-panel">
      <header class="va-head">
        <button class="va-icon" data-x aria-label="Cerrar asistente">←</button>
        <div class="va-avatar" aria-hidden="true">🌱</div>
        <div class="grow"><strong>Asistente Raíz Directa</strong><div class="tiny" id="vaStatus">te ayudo a publicar</div></div>
        <button class="va-icon" id="vaMute" aria-label="Activar o silenciar la voz del asistente" ${canSpeak ? '' : 'hidden'}>${st.mute ? '🔇' : '🔊'}</button>
      </header>
      <div class="va-msgs" id="vaMsgs" aria-live="polite"></div>
      <div class="va-chips" id="vaChips"></div>
      <div class="va-composer" id="vaComposer">
        <input id="vaText" placeholder="Escribe un mensaje" autocomplete="off" aria-label="Escribe tu respuesta">
        <button class="va-round" id="vaSend" aria-label="Enviar" hidden>➤</button>
        <button class="va-round" id="vaMic" aria-label="Mantén presionado para hablar; toca para grabar sin sostener" ${canRecognize ? '' : 'hidden'}>🎤</button>
      </div>
      <div class="va-recbar" id="vaRec" hidden>
        <button class="va-icon" id="vaCancel" aria-label="Cancelar grabación">🗑️</button>
        <span class="va-dot" aria-hidden="true"></span><span id="vaTime">0:00</span>
        <span class="va-wave" aria-hidden="true">${'<i></i>'.repeat(14)}</span>
        <span class="tiny muted va-slide">◀ desliza para cancelar</span>
        <button class="va-round" id="vaStop" aria-label="Terminar y enviar">➤</button>
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
  function me(textValue, { voice, secs } = {}) {
    const b = document.createElement('div');
    b.className = 'va-msg me';
    b.innerHTML = `${voice ? `<div class="va-note">🎤 ${secs}s · nota de voz transcrita</div>` : ''}${e(textValue)}<span class="va-check">✓✓</span>`;
    msgs.append(b);
    msgs.scrollTop = msgs.scrollHeight;
    return b;
  }
  function setChips(list) {
    chips.innerHTML = list.map((c, i) => `<button type="button" class="chip" data-i="${i}">${e(c.label)}</button>`).join('');
    chips.onclick = (ev) => {
      const b = ev.target.closest('[data-i]');
      if (b) list[Number(b.dataset.i)].run();
    };
  }

  // ---------- Preguntas ----------
  const v = () => form.get();
  const num = (x) => Number(String(x ?? '').replace(',', '.')) || 0;
  function missing() {
    const d = v();
    if (st.packs && !st.pack_kg) return 'pack_kg';
    if (!d.product) return 'product';
    if (!num(d.kg)) return 'kg';
    if (!num(d.rescue_price)) return 'rescue_price';
    if (!num(d.ref_price)) return 'ref_price';
    if (!d.quality) return 'quality'; // antes que las horas: el estado afina la estimación por clima
    if (!num(d.hours)) return 'hours';
    return null;
  }

  function ask(field) {
    st.asking = field;
    const d = v();
    const P = d.product ? d.product.toLowerCase() : 'el producto';
    const Q = {
      product: ['¿Qué producto quieres vender?', QUICK.map((n) => ({ label: `${PRODUCTS.find((p) => p.name === n).icon} ${n}`, run: () => answer(n) }))],
      pack_kg: [`¿Cuántos kilos pesa cada ${st.pack_unit}?`, []],
      kg: [`¿Cuántos kilos de ${P} tienes en total?`, []],
      rescue_price: [`¿A cómo quieres dar el kilo de ${P}? Es el precio de rescate.`,
        num(d.ref_price) ? [30, 40, 50].map((p) => { const val = Math.round(num(d.ref_price) * (1 - p / 100) * 2) / 2; return { label: `$${val} (−${p}%)`, run: () => answer(`${val} pesos`) }; }) : []],
      ref_price: [`¿Y a cómo lo vendes normalmente el kilo?`, []],
      hours: [st.vague ? `Dijiste “${VAGUE_LABEL[st.vague] || st.vague}”. Para el temporizador necesito un número: ¿cuántas horas le quedan para venderse fresco?` : '¿Cuántas horas le quedan para venderse fresco?',
        [...(ctx.getShelf()?.hours ? [{ label: `🌡️ ~${ctx.getShelf().hours} h (estimado por clima)`, run: () => answer(`${ctx.getShelf().hours} horas`) }] : []),
          ...[6, 12, 24, 48].map((h) => ({ label: h < 48 ? `${h} horas` : '2 días', run: () => answer(`${h} horas`) }))]],
      quality: ['¿Cómo está el producto?', QUALITY.map((q) => ({ label: q.label, run: () => { form.set('quality', q.id); form.update(); me(q.label); next(); } }))],
    }[field];
    bot(e(Q[0]), Q[0]);
    setChips(Q[1]);
  }

  function next() {
    const d = v();
    if (num(d.rescue_price) && num(d.ref_price) && num(d.rescue_price) >= num(d.ref_price)) {
      bot(`El precio de rescate (<strong>$${e(d.rescue_price)}</strong>) tiene que ser menor que el de siempre (<strong>$${e(d.ref_price)}</strong>).`, 'El precio de rescate tiene que ser menor que el de siempre.');
      form.set('rescue_price', '');
      form.update();
      return ask('rescue_price');
    }
    const m = missing();
    if (m) return ask(m);
    confirmStep();
  }

  // ---------- Interpretar lo dicho ----------
  function apply(r) {
    if (r.unsafe) {
      bot('⚠️ Si el producto está podrido o no es apto para consumo, <strong>no se puede publicar</strong> para venta como alimento.', 'Si el producto está podrido o no es apto para consumo, no se puede publicar como alimento.');
    }
    const set = (k, val) => val != null && form.set(k, val);
    set('product', r.product);
    if (r.product) form.autoCategory();
    if (r.packs) Object.assign(st, { packs: r.packs, pack_unit: r.pack_unit, pack_kg: r.pack_kg ?? st.pack_kg });
    if (r.pending_prices.length) st.pending_prices = r.pending_prices;
    if (r.pack_kg && !r.packs) st.pack_kg = r.pack_kg;
    const conv = resolvePacks(st);
    if (conv.kg) set('kg', conv.kg);
    if (conv.rescue_price || conv.ref_price) st.pending_prices = [];
    set('rescue_price', conv.rescue_price ?? r.rescue_price);
    set('ref_price', conv.ref_price ?? r.ref_price);
    if (r.kg != null && !r.packs) set('kg', r.kg);
    if (r.hours != null) (set('hours', r.hours), (st.vague = null));
    else if (r.hours_vague) st.vague = r.hours_vague;
    set('quality', r.quality);
    set('min_kg', r.min_kg);
    if (r.producer_transport) form.set('producer_transport', true);
    if (r.municipality) form.set('municipality', r.municipality);
    form.update();
    const said = [];
    const d = v();
    if (r.product) said.push(d.product);
    if (conv.kg) said.push(`${st.packs} ${st.pack_unit}s × ${st.pack_kg} kg = <strong>${conv.kg} kg</strong>`);
    else if (r.kg != null) said.push(`${d.kg} kg${r.approx ? ' (aprox.)' : ''}`);
    if (conv.rescue_price || r.rescue_price != null) said.push(`rescate $${d.rescue_price}/kg${conv.rescue_price ? ' (convertido del precio por ' + e(st.pack_unit || 'empaque') + ')' : ''}`);
    if (conv.ref_price || r.ref_price != null) said.push(`habitual $${d.ref_price}/kg`);
    if (r.hours != null) said.push(`${d.hours} h`);
    if (r.municipality) said.push(`en ${municipality(r.municipality).name}`);
    if (said.length) bot(`Anoté: ${said.join(' · ')}`);
    else if (!r.unsafe) bot('No logré entender un dato en eso. Puedes decirlo de otra forma o tocar una opción.', 'No logré entenderte. ¿Me lo dices de otra forma?');
  }

  function answer(input, meta) {
    if (!input.trim()) return;
    me(input, meta);
    chips.innerHTML = '';
    const r = parseSpoken(input, { context: st.asking });
    apply(r);
    next();
  }

  // ---------- Confirmación obligatoria ----------
  function confirmStep() {
    st.asking = 'confirm';
    const d = v();
    const b = bot(`<strong>Revisa antes de publicar:</strong>${ctx.summaryHtml(d)}
      <label class="inline-check va-decl"><input type="checkbox" data-decl ${d.declaration ? 'checked' : ''}><span>Declaro que es <strong>apto para consumo humano</strong> y la información es verdadera.</span></label>
      <div class="two" style="margin-top:10px"><button type="button" class="btn" data-pub>✅ Publicar</button><button type="button" class="btn secondary" data-fix>✏️ Corregir</button></div>`,
      `Vas a publicar ${d.kg} kilos de ${d.product} a ${d.rescue_price} pesos el kilo, con ${d.hours} horas de frescura. Revisa y confirma si está bien.`);
    $('[data-decl]', b).addEventListener('change', (ev) => form.set('declaration', ev.target.checked));
    $('[data-fix]', b).addEventListener('click', fixMenu);
    $('[data-pub]', b).addEventListener('click', async (ev) => {
      if (!v().declaration) return toast('Marca la declaración de que el producto es apto para consumo', 'error');
      ev.target.disabled = true;
      ev.target.textContent = 'Publicando…';
      try {
        await ctx.publish();
        stopSpeaking();
        if (!st.mute) speak('Listo. Tu oferta ya está publicada.');
        close();
      } catch (err) {
        ev.target.disabled = false;
        ev.target.textContent = "✅ Publicar";
        const f = Object.keys(err.fields || {})[0];
        bot(`No se pudo publicar: ${e(err.message)}${err.fields?.[f] ? ` — ${e(err.fields[f])}` : ''}`, `No se pudo publicar. ${err.message}`);
        if (['product', 'kg', 'rescue_price', 'ref_price', 'hours', 'quality'].includes(f)) { form.set(f, ''); ask(f); }
      }
    });
    setChips([{ label: '✏️ Corregir algo', run: fixMenu }]);
  }

  function fixMenu() {
    const items = [['product', 'Producto'], ['kg', 'Kilos'], ['rescue_price', 'Precio de rescate'], ['ref_price', 'Precio de siempre'], ['hours', 'Horas'], ['quality', 'Estado']];
    bot('¿Qué quieres cambiar? También puedes decírmelo, por ejemplo: “no, son 80 kilos”.', '¿Qué quieres cambiar?');
    setChips([...items.map(([f, l]) => ({ label: l, run: () => { form.set(f, ''); form.update(); ask(f); } })),
      { label: '📝 Ver formulario completo', run: () => { close(); ctx.showForm(); } }]);
    st.asking = null;
  }

  // ---------- Grabación estilo nota de voz ----------
  let live = null;
  let tick = null;
  function startRec() {
    if (st.recording) return;
    if (!navigator.onLine) return bot(e('Sin internet el dictado no funciona en la mayoría de los teléfonos. Escríbeme tu respuesta; yo lleno el formulario.'));
    stopSpeaking();
    st.rec = createRecognizer({
      onText: (t) => {
        live ||= me('…');
        live.classList.add('live');
        live.firstChild.textContent = t || '…';
        msgs.scrollTop = msgs.scrollHeight;
      },
      onError: (code) => {
        const m = ERROR_TEXT[code];
        if (m) bot(e(m), m);
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(code)) text.focus();
      },
      onEnd: (finalText) => {
        const secs = Math.max(1, Math.round((Date.now() - st.startedAt) / 1000));
        recUI(false);
        const t = finalText || (live && live.classList.contains('live') && st.sendOnEnd ? live.firstChild.textContent.replace('…', '') : '');
        live?.remove();
        live = null;
        if (st.sendOnEnd && t.trim()) answer(t.trim(), { voice: true, secs });
        st.sendOnEnd = false;
      },
    });
    try {
      st.rec.start();
      st.startedAt = Date.now();
      st.sendOnEnd = true;
      recUI(true);
    } catch {
      bot('No pude iniciar el micrófono. Escríbeme tu respuesta.');
    }
  }
  function stopRec(send = true) {
    if (!st.recording) return;
    st.sendOnEnd = send;
    send ? st.rec.stop() : st.rec.cancel();
    if (!send) recUI(false);
  }
  function recUI(on) {
    st.recording = on;
    $('#vaRec', root).hidden = !on;
    $('#vaComposer', root).hidden = on;
    status.textContent = on ? 'escuchando…' : 'te ayudo a publicar';
    clearInterval(tick);
    if (on) tick = setInterval(() => {
      const s = Math.floor((Date.now() - st.startedAt) / 1000);
      $('#vaTime', root).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 60) stopRec(true); // límite de un minuto por nota
    }, 250);
    else $('#vaTime', root).textContent = '0:00';
  }

  // Mantener presionado = graba mientras sostienes (como WhatsApp). Toque corto = graba hasta tocar ➤.
  const mic = $('#vaMic', root);
  let downAt = 0;
  let startX = 0;
  mic.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (!localStorage.getItem(MIC_OK)) return explainMic();
    downAt = Date.now();
    startX = ev.clientX;
    mic.setPointerCapture?.(ev.pointerId);
    startRec();
  });
  mic.addEventListener('pointermove', (ev) => {
    if (st.recording && downAt && startX - ev.clientX > 90) { downAt = 0; stopRec(false); toast('Grabación cancelada'); }
  });
  mic.addEventListener('pointerup', () => {
    if (!downAt) return;
    const held = Date.now() - downAt;
    downAt = 0;
    if (held > 450) stopRec(true); // soltó después de sostener → enviar
  });
  mic.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && !st.recording) { ev.preventDefault(); localStorage.getItem(MIC_OK) ? startRec() : explainMic(); }
  });
  $('#vaStop', root).addEventListener('click', () => stopRec(true));
  $('#vaCancel', root).addEventListener('click', () => stopRec(false));

  function explainMic() {
    const b = bot(`<strong>🎙️ Antes de usar el micrófono</strong>
      <ul class="small" style="margin:6px 0;padding-left:18px">
        <li>Tu teléfono te pedirá permiso para usar el micrófono.</li>
        <li>El dictado lo hace tu navegador. En Chrome, la voz se procesa en servidores de Google para convertirla en texto.</li>
        <li>Raíz Directa <strong>no graba ni guarda tu audio</strong> ni la transcripción; sólo guardamos los datos que tú confirmes al publicar.</li>
        <li>Nada se publica sin que tú lo confirmes.</li>
      </ul>
      <div class="two"><button type="button" class="btn sm" data-ok>Entendido</button><button type="button" class="btn ghost sm" data-no>Mejor escribo</button></div>`,
      'Antes de usar el micrófono: tu teléfono te pedirá permiso. No guardamos tu audio. Nada se publica sin tu confirmación.');
    $('[data-ok]', b).addEventListener('click', () => { localStorage.setItem(MIC_OK, '1'); b.querySelector('.two').remove(); bot('Listo. <strong>Mantén presionado 🎤</strong> mientras hablas y suelta para enviar, o tócalo una vez y luego ➤.'); });
    $('[data-no]', b).addEventListener('click', () => { b.querySelector('.two').remove(); text.focus(); });
  }

  // ---------- Escritura (alternativa manual siempre disponible) ----------
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
    ev.currentTarget.textContent = st.mute ? '🔇' : '🔊';
    if (st.mute) stopSpeaking();
  });
  root.querySelector('[data-x]').addEventListener('click', () => close());

  // ---------- Abrir / cerrar ----------
  function open({ listen = false } = {}) {
    root.hidden = false;
    document.body.classList.add('va-open');
    if (!msgs.children.length) {
      const muni = municipality(v().municipality || user.municipality);
      const intro = canRecognize
        ? `Hola, ${e(user.name.split(' ')[0])} 👋 Dime qué quieres vender, como en un mensaje de voz: <em>“Tengo 100 kilos de jitomate a 12 pesos, normalmente a 25, me quedan 24 horas”</em>. Lo que falte te lo pregunto.`
        : `Hola, ${e(user.name.split(' ')[0])} 👋 Este navegador no permite dictar, pero puedes <strong>escribirme</strong> como en WhatsApp y yo lleno el formulario.`;
      bot(intro, canRecognize ? 'Hola. Dime qué quieres vender, cuántos kilos, a cómo y cuánto tiempo le queda.' : '');
      bot(`<span class="tiny muted">Zona de recolección: ${e(muni?.name || '')} (de tu perfil; puedes decir otra).</span>`);
      const d = v();
      if (d.product || d.kg) setTimeout(next, 300); // si ya había datos, sólo pregunta lo que falta
    }
    if (listen && canRecognize && localStorage.getItem(MIC_OK)) startRec();
    else if (canRecognize && !localStorage.getItem(MIC_OK)) explainMic();
    setTimeout(() => (canRecognize ? mic : text).focus(), 50);
  }
  function close() {
    if (st.recording) stopRec(false);
    stopSpeaking();
    root.hidden = true;
    document.body.classList.remove('va-open');
  }
  return { open, close, destroy: () => { close(); root.remove(); } };
}
