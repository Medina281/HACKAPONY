// Interpreta una frase dicha o escrita como en WhatsApp y propone valores para el formulario.
// Es un analizador por reglas (expresiones regulares), NO inteligencia artificial.
// Ejemplo: "Tengo 100 kilos de jitomate a 12 pesos el kilo, normalmente a 25, me quedan 24 horas"
import { PRODUCTS, normalize } from './catalog.js';

const WORDS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciocho: 18,
  veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
  ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, mil: 1000, medio: 0.5, media: 0.5,
};

function wordsToDigits(t) {
  return t.replace(/\b([a-z]+)\b/g, (w) => (w in WORDS ? String(WORDS[w]) : w));
}

const NUM = '(\\d+(?:[.,]\\d+)?)';
const toNum = (s) => Number(String(s).replace(',', '.'));

export function parseSpoken(input) {
  let t = normalize(input).replace(/\$\s*/g, '$');
  t = wordsToDigits(t);
  const out = { product: null, kg: null, rescuePrice: null, refPrice: null, hours: null, missing: [] };

  // Producto: busca el nombre o alias más largo que aparezca.
  let best = null;
  for (const p of PRODUCTS) {
    for (const name of [p.name, ...p.alias]) {
      const n = normalize(name);
      if (new RegExp(`\\b${n}\\b`).test(t) && (!best || n.length > best.len)) best = { name: p.name, len: n.length };
    }
  }
  if (best) out.product = best.name;

  // Cantidad
  const tons = t.match(new RegExp(`${NUM}\\s*(toneladas?|ton)\\b`));
  const kg = t.match(new RegExp(`${NUM}\\s*(kilos?|kilogramos?|kgs?)\\b`));
  if (tons) out.kg = toNum(tons[1]) * 1000;
  else if (kg) out.kg = toNum(kg[1]);

  // Tiempo
  const hrs = t.match(new RegExp(`${NUM}\\s*(horas?|hrs?|h)\\b`));
  const days = t.match(new RegExp(`${NUM}\\s*dias?\\b`));
  if (hrs) out.hours = toNum(hrs[1]);
  else if (days) out.hours = toNum(days[1]) * 24;

  // Precios: "12 pesos", "$12", "a 12 el kilo". Distingue el habitual por contexto.
  const prices = [];
  const re = new RegExp(`(?:\\$${NUM}|${NUM}\\s*(?:pesos|varos|mxn)|\\ba\\s+${NUM}\\s+(?:el|por)\\s+(?:kilo|kg))`, 'g');
  let m;
  while ((m = re.exec(t))) {
    const value = toNum(m[1] || m[2] || m[3]);
    const before = t.slice(Math.max(0, m.index - 30), m.index);
    const isRef = /(normal|habitual|usual|regular|antes|suelo|siempre|mercado|en la central|precio de lista)/.test(before);
    prices.push({ value, isRef });
  }
  const ref = prices.find((p) => p.isRef);
  const rescue = prices.find((p) => !p.isRef);
  if (ref) out.refPrice = ref.value;
  if (rescue) out.rescuePrice = rescue.value;
  if (!ref && prices.length >= 2) {
    const sorted = [...prices].sort((a, b) => b.value - a.value);
    out.refPrice = sorted[0].value;
    out.rescuePrice = sorted[sorted.length - 1].value;
  }

  for (const k of ['product', 'kg', 'rescuePrice', 'refPrice', 'hours']) if (out[k] == null) out.missing.push(k);
  return out;
}
