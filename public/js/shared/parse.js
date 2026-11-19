// Intérprete de frases habladas o escritas (español de México) para el Asistente de Publicación.
// Es un analizador por REGLAS, no inteligencia artificial. Nunca inventa datos: si algo no se dijo
// queda como faltante y el asistente lo pregunta.
import { PRODUCTS, MUNICIPALITIES, normalize } from './catalog.js';

// ---------- Números escritos con palabras ----------
const UNITS = {
  cero: 0, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};
const isNumWord = (w) => w in UNITS || w in TENS || w in HUNDREDS || w === 'mil';

/** Convierte secuencias como "ciento veinticinco", "treinta y cinco", "dos mil quinientos" a dígitos. */
export function wordsToNumbers(text) {
  const toks = text.split(/(\s+)/);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (!isNumWord(w) || ((w === 'un' || w === 'una') && !nextIsNumberish(toks, i))) {
      out.push(w);
      continue;
    }
    let total = 0;
    let cur = 0;
    let j = i;
    let last = i;
    while (j < toks.length) {
      const t = toks[j];
      if (/^\s+$/.test(t)) { j++; continue; }
      if (t === 'y' && cur % 10 === 0 && cur >= 30 && toks[j + 2] in UNITS && UNITS[toks[j + 2]] < 10) { j++; continue; }
      if (t in UNITS) cur += UNITS[t];
      else if (t in TENS) cur += TENS[t];
      else if (t in HUNDREDS) cur += HUNDREDS[t];
      else if (t === 'mil') { total += (cur || 1) * 1000; cur = 0; }
      else break;
      last = j;
      j++;
    }
    out.push(String(total + cur));
    i = last;
  }
  return out.join('');
}
function nextIsNumberish(toks, i) {
  // "un kilo", "una caja", "un dia": el artículo funciona como el número 1
  const next = (toks[i + 2] || '').trim();
  return /^(kilo|kilogramo|kg|caja|reja|costal|arpilla|bulto|huacal|cubeta|tonelada|dia|semana|hora|peso|mil)/.test(next);
}

// ---------- Unidades ----------
const PACK = '(cajas?|rejas?|costales?|arpillas?|bultos?|huacales?|cubetas?|tinas?)';
const singular = (u) => u.replace(/es$/, '').replace(/s$/, '').replace(/^costal$/, 'costal');
const NUM = '(\\d+(?:[.,]\\d+)?)';
const toNum = (s) => Number(String(s).replace(',', '.'));

export const FIELDS = ['product', 'kg', 'rescue_price', 'ref_price', 'quality', 'hours'];
export const VAGUE_LABEL = { manana: 'mañana', 'pasado manana': 'pasado mañana', hoy: 'hoy', 'esta tarde': 'esta tarde', 'esta noche': 'esta noche', 'ya mero': 'ya mero', rapido: 'rápido', urge: 'urge' };

export function normalizeSpeech(input) {
  let t = normalize(input)
    .replace(/[¿?¡!"“”]/g, ' ')
    .replace(/[,;:]/g, ' , ')
    .replace(/\.(?!\d)/g, ' . ')
    .replace(/\$\s*/g, '$')
    .replace(/\bpa'?\b/g, 'para')
    .replace(/\bkila?s?\b/g, (m) => (m.startsWith('kila') ? 'kilos' : m))
    .replace(/\b(varos?|baros?|pesitos?|pesos?)\b/g, 'pesos')
    .replace(/\s+/g, ' ');
  t = wordsToNumbers(t);
  t = t
    .replace(/\bmedi[oa] (tonelada|kilo)/g, '0.5 $1')
    .replace(/(\d+) (kilos?|toneladas?|horas?|dias?) y medi[oa]/g, (_, n, u) => `${Number(n) + 0.5} ${u}`)
    .replace(/(\d)\s*(?:k|kgs?)\b/g, '$1 kilos')
    .replace(/(\d)\s*h\b/g, '$1 horas');
  return t;
}

/**
 * Extrae los datos de una frase. Devuelve sólo lo que se dijo.
 * @returns {{product, kg, packs, pack_unit, pack_kg, rescue_price, ref_price, pending_prices, hours,
 *            hours_vague, quality, municipality, min_kg, producer_transport, unsafe, approx, missing}}
 */
export function parseSpoken(input, { context } = {}) {
  const t = normalizeSpeech(input);
  const r = { product: null, kg: null, packs: null, pack_unit: null, pack_kg: null, rescue_price: null, ref_price: null, pending_prices: [], hours: null, hours_vague: null, quality: null, municipality: null, min_kg: null, producer_transport: null, unsafe: false, approx: false, missing: [] };

  // Producto (nombre o alias más largo)
  let best = null;
  for (const p of PRODUCTS) for (const name of [p.name, ...p.alias]) {
    const n = normalize(name);
    if (new RegExp(`\\b${n}\\b`).test(t) && (!best || n.length > best.len)) best = { name: p.name, len: n.length };
  }
  if (best) r.product = best.name;

  // Ubicación (municipio)
  // Fuera de Michoacán se exige "en/de/desde ..." para no confundir "limón colima" con la ciudad de Colima
  for (const m of MUNICIPALITIES) {
    const n = normalize(m.name.replace(/\s*\(.*\)/, ''));
    const re = m.state === 'Michoacán' ? new RegExp(`\\b${n}\\b`) : new RegExp(`\\b(?:en|de|desde|para)\\s+${n}\\b`);
    if (re.test(t)) r.municipality = m.id;
  }

  r.approx = /\b(como|unos|unas|mas o menos|aproximadamente|casi|alrededor de)\s+\d/.test(t);

  // Cantidad: empaques primero ("10 cajas de 20 kilos"), luego toneladas o kilos
  const packM = t.match(new RegExp(`${NUM}\\s*${PACK}(?:\\s*de\\s*${NUM}\\s*(?:kilos?|kilogramos?))?`));
  const eachM = t.match(new RegExp(`(?:cada (?:una|uno|caja|reja|costal|arpilla|bulto|huacal|cubeta|tina) (?:pesa|trae|tiene|es de|de)|de)\\s*${NUM}\\s*kilos?\\s*(?:cada (?:una|uno)|c\\/u)`));
  const tons = t.match(new RegExp(`${NUM}\\s*(toneladas?|ton)\\b`));
  const kgM = [...t.matchAll(new RegExp(`${NUM}\\s*(kilos?|kilogramos?)\\b`, 'g'))];
  if (packM) {
    r.packs = toNum(packM[1]);
    r.pack_unit = singular(packM[2]);
    r.pack_kg = packM[3] ? toNum(packM[3]) : eachM ? toNum(eachM[1]) : null;
    if (r.pack_kg) r.kg = Math.round(r.packs * r.pack_kg * 10) / 10;
  } else if (tons) r.kg = toNum(tons[1]) * 1000;
  else {
    // Primer "N kilos" que no sea parte de "mínimo N kilos" ni de un precio "a N el kilo"
    const k = kgM.find((m) => !/(minimo|minima|desde)\s*(de\s*)?$/.test(t.slice(Math.max(0, m.index - 12), m.index)));
    if (k) r.kg = toNum(k[1]);
    // "100 de durazno", "30 de chile poblano": número seguido del producto, sin decir "kilos"
    if (r.kg == null) {
      const names = PRODUCTS.flatMap((p) => [p.name, ...p.alias]).map((n) => normalize(n)).sort((a, b) => b.length - a.length).join('|');
      const m = t.match(new RegExp(`(?<!\\ba\\s)(?<!\\$)\\b${NUM}\\s+de\\s+(?:${names})\\b`));
      if (m) r.kg = toNum(m[1]);
    }
  }
  const minM = t.match(new RegExp(`(?:minimo|minima|desde)\\s*(?:de\\s*)?${NUM}\\s*kilos?`));
  if (minM) r.min_kg = toNum(minM[1]);

  // Tiempo
  const hrs = t.match(new RegExp(`${NUM}\\s*(horas?|hrs?)\\b`));
  const days = t.match(new RegExp(`${NUM}\\s*dias?\\b`));
  const weeks = t.match(new RegExp(`${NUM}\\s*semanas?\\b`));
  if (hrs) r.hours = toNum(hrs[1]);
  else if (days) r.hours = toNum(days[1]) * 24;
  else if (weeks) r.hours = toNum(weeks[1]) * 168;
  else if (/\bmedio dia\b/.test(t)) r.hours = 12;
  else if (/\b(hasta )?(manana|pasado manana|hoy|esta tarde|esta noche|ya mero|rapido|urge)\b/.test(t)) {
    r.hours_vague = (t.match(/\b(pasado manana|manana|hoy|esta tarde|esta noche|ya mero|rapido|urge)\b/) || [])[1]; // se pregunta, no se adivina
  }

  // Precios
  const prices = [];
  const taken = [];
  const unitAfter = (end) => {
    const after = t.slice(end, end + 22);
    if (/^\s*(?:el|por|la|x)?\s*(kilo|kg)/.test(after)) return 'kg';
    if (/^\s*(?:el|por|la|x)?\s*tonelada/.test(after)) return 'ton';
    const pm = after.match(new RegExp(`^\\s*(?:el|por|la|cada|x)?\\s*${PACK}`));
    if (pm) return singular(pm[1]);
    return null;
  };
  // "la caja la doy en 300": la unidad se dijo antes del precio
  const unitBefore = (index) => {
    const before = t.slice(Math.max(0, index - 26), index);
    const pm = before.match(new RegExp(`(?:la|el|por|cada)\\s*${PACK}\\s*(?:la|lo|las|los)?\\s*(?:doy|vendo|dejo|pongo|ofrezco|pagan|venden)?[^,.]*$`));
    if (pm) return singular(pm[1]);
    if (/(?:el|por|cada)\s*(kilo|kg)\s*(?:lo|la)?\s*(?:doy|vendo|dejo|pongo)?[^,.]*$/.test(before)) return 'kg';
    return null;
  };
  const add = (value, index, end) => {
    const before = t.slice(Math.max(0, index - 32), index);
    const isRef = /(normal|habitual|usual|regular|antes|suelo|siempre|mercado|central|abasto|precio de lista|lo pagan|me lo pagan)/.test(before);
    prices.push({ value, isRef, index, unit: unitAfter(end) || unitBefore(index) });
    taken.push([index, end]);
  };
  let m;
  const re = new RegExp(`\\$${NUM}|${NUM}\\s*pesos`, 'g');
  while ((m = re.exec(t))) add(toNum(m[1] || m[2]), m.index, m.index + m[0].length);
  const loose = new RegExp(`\\b(?:a|en)\\s+${NUM}\\b(?!\\s*(?:kilos?|kilogramos?|horas?|hrs?|dias?|semanas?|toneladas?|ton|%|por ciento|cajas?|rejas?|costales?|arpillas?|bultos?))`, 'g');
  while ((m = loose.exec(t))) {
    const end = m.index + m[0].length;
    if (!taken.some(([a, b]) => m.index < b && end > a)) add(toNum(m[1]), m.index, end);
  }
  // "normalmente 350", "en la central 20": número justo después de una palabra de precio habitual
  const refLoose = new RegExp(`(?:normalmente|normal|habitual|siempre|en la central|antes)\\s+(?:lo vendo|la vendo|lo dan|se vende|esta|está|sale)?\\s*${NUM}\\b(?!\\s*(?:kilos?|horas?|dias?|semanas?|toneladas?|cajas?))`, 'g');
  while ((m = refLoose.exec(t))) {
    const numAt = m.index + m[0].lastIndexOf(m[1]);
    const end = numAt + m[1].length;
    if (!taken.some(([a, b]) => numAt < b && end > a)) add(toNum(m[1]), numAt, end);
  }
  prices.sort((a, b) => a.index - b.index);
  // "la caja en 300 ... me la pagan a 500": si un precio se dijo por empaque, el otro sin unidad comparte esa unidad
  const packUnit = prices.find((p) => p.unit && !['kg', 'ton'].includes(p.unit))?.unit;
  if (packUnit) for (const p of prices) if (!p.unit) p.unit = packUnit;
  const refP = prices.find((p) => p.isRef);
  const resP = prices.find((p) => !p.isRef);
  let ref = refP || null;
  let res = resP || null;
  if (!refP && prices.length >= 2) {
    const s = [...prices].sort((a, b) => b.value - a.value);
    ref = s[0];
    res = s[s.length - 1];
  }
  const perKg = (p, field) => {
    if (!p) return null;
    if (!p.unit || p.unit === 'kg') return p.value;
    if (p.unit === 'ton') return Math.round((p.value / 1000) * 100) / 100;
    const packKg = r.pack_unit === p.unit ? r.pack_kg : null;
    if (packKg) return Math.round((p.value / packKg) * 100) / 100;
    r.pending_prices.push({ field, value: p.value, unit: p.unit }); // falta saber cuánto pesa cada empaque
    return null;
  };
  r.rescue_price = perKg(res, 'rescue_price');
  r.ref_price = perKg(ref, 'ref_price');

  // Estado declarado (sólo si se menciona)
  if (/\b(podrid[oa]s?|descompuest[oa]s?|echad[oa]s? a perder|con hongo|apestan?)\b/.test(t)) r.unsafe = true;
  if (/\b(ya se va a pasar|se va a pasar|ya mero se pasa|ya se pasa|se va a echar a perder|ya casi se pasa|ya no aguanta|urge venderlo|ultimo dia|proximo a)\b/.test(t)) r.quality = 'proximo';
  else if (/\b(madur[oa]s?|maduritos?|maduritas?|bien madur|pinton)/.test(t)) r.quality = 'maduro';
  else if (/\b(fe[oa]s?|chic[oa]s?|chiquit[oa]s?|manchad[oa]s?|imperfect[oa]s?|de segunda|rezaga|desigual|deforme|tamano irregular|golpecit)/.test(t)) r.quality = 'imperfeccion';
  else if (/\b(excedente|sobr[oa]|sobraron|sobrante|no se vendio|no lo vendi|no se vendieron|buen estado|esta bueno|esta buena|fresc[oa]s?)\b/.test(t)) r.quality = 'excedente';

  if (/\b(puedo llevarlo|se lo llevo|lo llevo|yo lo llevo|tengo camioneta|entrega a domicilio|se los llevo)\b/.test(t)) r.producer_transport = true;

  // Respuesta a una pregunta concreta: un número suelto se asigna al campo que se preguntó.
  if (context) applyContext(r, t, context);

  if (r.kg == null && r.packs && !r.pack_kg) r.missing.push('pack_kg');
  for (const k of ['product', 'kg', 'rescue_price', 'ref_price', 'quality', 'hours']) if (r[k] == null && !(k === 'kg' && r.packs)) r.missing.push(k);
  return r;
}

function applyContext(r, t, field) {
  const nums = [...t.matchAll(/\d+(?:[.,]\d+)?/g)].map((x) => toNum(x[0]));
  const first = nums[0];
  if (field === 'product' && !r.product) {
    const words = t.replace(/\b(es|son|tengo|vendo|de|el|la|los|las|unos?|unas?)\b/g, ' ').replace(/[^a-zñ ]/g, ' ').trim();
    if (words.length >= 3 && words.length <= 40) r.product = words[0].toUpperCase() + words.slice(1);
  }
  if (first == null) return;
  // Sólo se usa para el dato preguntado un número que NO se haya entendido ya como otra cosa
  // ("aguanta un día" son horas, no el precio; "100 kilos" son kilos).
  const used = [r.kg, r.rescue_price, r.ref_price, r.hours, r.hours != null ? r.hours / 24 : null, r.pack_kg, r.packs, r.min_kg].filter((x) => x != null);
  const free = nums.filter((n) => !used.includes(n));
  const pick = free[0];
  if (field === 'ref_price' && r.ref_price == null && nums.length === 1 && r.rescue_price === first && r.kg == null) {
    // Al preguntar por el precio de siempre, "a 25" es el de siempre, no el de rescate.
    r.ref_price = first;
    r.rescue_price = null;
    return;
  }
  if (pick == null) return;
  if (field === 'kg' && r.kg == null && !r.packs) r.kg = pick;
  if (field === 'pack_kg' && r.pack_kg == null) r.pack_kg = pick;
  if (field === 'rescue_price' && r.rescue_price == null && !r.pending_prices.length) r.rescue_price = pick;
  if (field === 'ref_price' && r.ref_price == null) r.ref_price = pick;
  if (field === 'hours' && r.hours == null) r.hours = /dia/.test(t) ? pick * 24 : pick;
}

/** Convierte lo que el agricultor dijo de empaques cuando ya se sabe cuánto pesa cada uno. */
export function resolvePacks(state) {
  const out = {};
  if (state.packs && state.pack_kg) out.kg = Math.round(state.packs * state.pack_kg * 10) / 10;
  if (state.pack_kg) for (const p of state.pending_prices || []) out[p.field] = Math.round((p.value / state.pack_kg) * 100) / 100;
  return out;
}

/**
 * Varios productos en un mismo mensaje: "100 kilos de jitomate a 12 y 50 kilos de cebolla a 8".
 * Se corta el texto en el último separador (y, coma, también, además) antes de cada producto nuevo.
 * Datos compartidos (horas, municipio, transporte) sólo se copian a todos si se dice "los dos", "ambos", "todo".
 * @returns {Array<ReturnType<typeof parseSpoken> & {segment: string}>}
 */
export function parseMulti(input) {
  const t = normalizeSpeech(input);
  const hits = [];
  for (const p of PRODUCTS) for (const name of [p.name, ...p.alias]) {
    const re = new RegExp(`\\b${normalize(name)}\\b`, 'g');
    let m;
    while ((m = re.exec(t))) hits.push({ name: p.name, start: m.index, end: m.index + m[0].length });
  }
  // Quitar coincidencias contenidas en otras más largas y repetidas del mismo producto
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const list = [];
  for (const h of hits) {
    if (list.some((x) => h.start < x.end && h.end > x.start)) continue;
    if (list.some((x) => x.name === h.name)) continue;
    list.push(h);
  }
  if (list.length <= 1) return [{ ...parseSpoken(input), segment: input }];
  const cuts = [0];
  for (let i = 1; i < list.length; i++) {
    const region = t.slice(list[i - 1].end, list[i].start);
    const seps = [...region.matchAll(/\s(?:y|e|,|tambien|ademas|aparte|luego|\.)\s/g)];
    const sep = seps.length ? seps[seps.length - 1] : null;
    cuts.push(sep ? list[i - 1].end + sep.index + 1 : list[i].start);
  }
  cuts.push(t.length);
  const parts = cuts.slice(0, -1).map((c, i) => t.slice(c, cuts[i + 1]).replace(/^\s*(?:y|e|,|tambien|ademas|aparte|luego|\.)\s+/, '').trim());
  const results = parts.map((seg) => ({ ...parseSpoken(seg), segment: seg }));
  const sharedAll = /\b(ambos|ambas|(?:los|las|a los|a las) (?:dos|2|tres|3)|todo|todos|todas|a cada uno)\b/.test(t);
  const whole = parseSpoken(input);
  for (const r of results) {
    if (whole.municipality) r.municipality = whole.municipality; // la ubicación es del productor
    if (whole.producer_transport) r.producer_transport = true;
    if (sharedAll) {
      for (const k of ['hours', 'quality', 'min_kg']) if (r[k] == null && whole[k] != null) r[k] = whole[k];
    }
    r.missing = r.missing.filter((k) => r[k] == null);
  }
  return results;
}

/**
 * El agricultor sólo dice SU precio; el de rescate lo pone la app.
 * Si dijo un solo precio ("lo doy a 25") ése es su precio. Si dijo dos ("a 12, normalmente 25") se toma el normal.
 */
export function asOwnPrice(r) {
  if (!r) return r;
  if (r.ref_price == null && r.rescue_price != null) r.ref_price = r.rescue_price;
  r.rescue_price = null;
  if (r.pending_prices?.length) {
    const own = r.pending_prices.find((p) => p.field === 'ref_price') || r.pending_prices[0];
    r.pending_prices = [{ ...own, field: 'ref_price' }];
  }
  if (r.missing) r.missing = r.missing.filter((m) => m !== 'rescue_price' && !(m === 'ref_price' && r.ref_price != null));
  return r;
}
