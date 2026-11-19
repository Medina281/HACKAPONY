// Precios de mercado reales del SNIIM (Secretaría de Economía), consulta "Frutas y Hortalizas" por producto.
// Se consulta desde el servidor (el navegador no puede por CORS), se guarda en caché 12 h y nunca se inventa:
// si SNIIM no responde, se informa "sin dato" y se ofrece el enlace oficial.
import { tx } from '../db.js';
import { normalize } from '../../public/js/shared/catalog.js';

export const SNIIM_HOME = 'https://www.economia-sniim.gob.mx/nuevo/Home.aspx';
const BASE = 'https://www.economia-sniim.gob.mx/NUEVO/Consultas/MercadosNacionales/PreciosDeMercado/Agricolas/ResultadosConsultaFechaFrutasYHortalizas.aspx';
const TTL = 12 * 3600e3;

// ProductoId tomados del mapa del sitio del SNIIM (economia-sniim.gob.mx/nuevo/mapa.asp).
export const SNIIM_PRODUCTS = {
  jitomate: { id: 839, variety: 'Jitomate Saladette' },
  aguacate: { id: 133, variety: 'Aguacate Hass' },
  fresa: { id: 358, variety: 'Fresa' },
  guayaba: { id: 378, variety: 'Guayaba' },
  limon: { id: 418, variety: 'Limón c/semilla #3' },
  mango: { id: 465, variety: 'Mango Ataulfo' },
  calabacita: { id: 170, variety: 'Calabacita Italiana' },
  cebolla: { id: 183, variety: 'Cebolla Bola' },
  papa: { id: 740, variety: 'Papa Alpha' },
  platano: { id: 732, variety: 'Plátano Tabasco' },
  chile: { id: 246, variety: 'Chile Serrano' },
  zanahoria: { id: 880, variety: 'Zanahoria mediana' },
  elote: { id: 308, variety: 'Elote' },
  brocoli: { id: 162, variety: 'Brócoli' },
  lechuga: { id: 409, variety: 'Lechuga Romanita' },
  naranja: { id: 551, variety: 'Naranja Valencia mediana' },
};
export const sniimFor = (product) => SNIIM_PRODUCTS[normalize(product || '')] || null;

const dmy = (t) => {
  const d = new Date(t - 6 * 3600e3); // fecha en hora del centro de México
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

export function sniimUrl(id, now) {
  const q = new URLSearchParams({
    fechaInicio: dmy(now - 7 * 864e5), fechaFinal: dmy(now), ProductoId: String(id), OrigenId: '-1', Origen: 'Todos',
    DestinoId: '-1', Destino: 'Todos', PreciosPorId: '2', RegistrosPorPagina: '500',
  });
  return `${BASE}?${q}`;
}

const clean = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
  .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const money = (s) => {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/** Extrae filas de la tabla de resultados del SNIIM localizando las columnas por su encabezado. */
export function parseSniimHtml(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => clean(c[1])));
  const hi = rows.findIndex((r) => r.some((c) => /frec/i.test(c)) && r.some((c) => /m[ií]n/i.test(c)));
  if (hi < 0) return [];
  const h = rows[hi].map((c) => normalize(c));
  const col = (re) => h.findIndex((c) => re.test(c));
  const idx = { date: col(/fecha/), pres: col(/presentac/), origin: col(/origen/), dest: col(/destino|mercado/), min: col(/min/), max: col(/max/), freq: col(/frec/) };
  const out = [];
  let lastDate = null;
  for (const r of rows.slice(hi + 1)) {
    if (r.length < 4) continue;
    const freq = money(r[idx.freq]);
    if (!freq) continue;
    const date = idx.date >= 0 && /\d{1,2}\/\d{1,2}\/\d{4}/.test(r[idx.date]) ? r[idx.date] : lastDate;
    lastDate = date;
    out.push({ date, presentation: r[idx.pres] || '', origin: r[idx.origin] || '', destination: r[idx.dest] || '', min_c: money(r[idx.min]), max_c: money(r[idx.max]), freq_c: freq });
  }
  return out;
}

const toTime = (d) => {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(d || '');
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
};

/** Prefiere el Mercado de Abasto de Morelia; si no aparece, mediana nacional del día más reciente. */
export function pickPrice(rows) {
  if (!rows.length) return null;
  const latest = Math.max(...rows.map((r) => toTime(r.date)));
  const day = rows.filter((r) => toTime(r.date) === latest);
  const mor = day.filter((r) => /morelia/i.test(r.destination));
  if (mor.length) {
    const r = mor[0];
    return { scope: 'morelia', market: r.destination, date: r.date, freq_c: r.freq_c, min_c: r.min_c, max_c: r.max_c, n_markets: 1 };
  }
  const f = day.map((r) => r.freq_c).sort((a, b) => a - b);
  const med = f.length % 2 ? f[(f.length - 1) / 2] : Math.round((f[f.length / 2 - 1] + f[f.length / 2]) / 2);
  return { scope: 'nacional', market: `Mediana de ${day.length} mercados`, date: day[0].date, freq_c: med, min_c: f[0], max_c: f[f.length - 1], n_markets: day.length };
}

const inflight = new Map();

export async function refreshPrice(db, product, { now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  const sp = sniimFor(product);
  if (!sp) return { ok: false, error: 'Producto sin equivalente en SNIIM' };
  const url = sniimUrl(sp.id, now);
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'RaizDirecta/1.0 (prototipo HackPony)' } });
    if (!res.ok) throw new Error(`SNIIM respondió ${res.status}`);
    const p = pickPrice(parseSniimHtml(await res.text()));
    if (!p) throw new Error('SNIIM no publicó precios para este producto en los últimos 7 días');
    tx(db, () => {
      db.prepare(`INSERT INTO market_prices (product, sniim_id, variety, scope, market, price_date, freq_c, min_c, max_c, n_markets, source_url, fetched_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(normalize(product), sp.id, sp.variety, p.scope, p.market, p.date, p.freq_c, p.min_c, p.max_c, p.n_markets, url, now);
    });
    return { ok: true, price: p };
  } catch (e) {
    db.prepare('INSERT INTO market_fetch_log (product, ok, error, fetched_at) VALUES (?,?,?,?)').run(normalize(product), 0, String(e.message).slice(0, 200), now);
    return { ok: false, error: e.message };
  }
}

/** Devuelve el último precio guardado y, si es viejo, lo actualiza en segundo plano. */
export function getMarketPrice(db, product, { now = Date.now(), fetchImpl } = {}) {
  const sp = sniimFor(product);
  if (!sp) return { available: false, reason: 'Este producto no tiene equivalente en el catálogo del SNIIM.', sniim_url: SNIIM_HOME };
  const row = db.prepare('SELECT * FROM market_prices WHERE product = ? ORDER BY fetched_at DESC LIMIT 1').get(normalize(product));
  const stale = !row || now - row.fetched_at > TTL;
  if (stale && !inflight.has(sp.id)) {
    const lastFail = db.prepare('SELECT fetched_at FROM market_fetch_log WHERE product = ? ORDER BY id DESC LIMIT 1').get(normalize(product));
    if (!lastFail || now - lastFail.fetched_at > 10 * 60e3) {
      const p = refreshPrice(db, product, { now, fetchImpl }).finally(() => inflight.delete(sp.id));
      inflight.set(sp.id, p);
    }
  }
  if (!row) {
    const fail = db.prepare('SELECT error FROM market_fetch_log WHERE product = ? ORDER BY id DESC LIMIT 1').get(normalize(product));
    return { available: false, updating: inflight.has(sp.id), reason: fail ? `No se pudo consultar el SNIIM: ${fail.error}` : 'Consultando al SNIIM…', variety: sp.variety, sniim_url: SNIIM_HOME };
  }
  return {
    available: true, updating: inflight.has(sp.id), variety: row.variety, scope: row.scope, market: row.market, date: row.price_date,
    freq_c: row.freq_c, min_c: row.min_c, max_c: row.max_c, n_markets: row.n_markets, fetched_at: row.fetched_at, source_url: row.source_url, sniim_url: SNIIM_HOME,
  };
}

export const waitForRefresh = () => Promise.all([...inflight.values()]);
