// Precios de referencia regionales del archivo entregado por el equipo ("sniim_nacional_completo.json").
// IMPORTANTE: NO se presentan como precios oficiales del SNIIM. En todos los registros del archivo el mínimo
// es exactamente 0.88× y el máximo 1.15× del precio frecuente, patrón propio de datos generados/modelados.
// Se muestran siempre con la etiqueta "referencia del equipo (no verificada)". La consulta en vivo al SNIIM
// (services/market.js) sigue siendo la única fuente que se marca como "SNIIM".
import fs from 'node:fs';
import { normalize } from '../../public/js/shared/catalog.js';
import { realService } from './sniim-real.js';

const REF = JSON.parse(fs.readFileSync(new URL('../data/referencia-precios.json', import.meta.url), 'utf8'));
export const LABEL = 'Referencia regional del equipo (formato SNIIM, no verificada)';
export const STATES = Object.keys(REF.markets);
const c = (x) => Math.round(x * 100);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

const variantsOf = (product) => REF.catalog.filter((v) => normalize(v.product) === normalize(product || ''));

/** Horas de frescura sugeridas por el archivo del equipo para el producto (variante principal). */
export function hoursFor(product) {
  return variantsOf(product)[0]?.hours ?? null;
}

/** Referencia del producto en el estado del usuario (Michoacán por defecto) y mediana nacional. */
export function referenceFor(product, state = 'Michoacán') {
  // 1) Precios REALES extraídos del SNIIM con el scraper (si el archivo existe)
  const real = realService();
  if (real) {
    const st = state === 'DF' ? 'Distrito Federal' : state;
    const r = real.obtenerPrecioRealSNIIM(product, st);
    if (!r.disponible && state === 'DF') Object.assign(r, real.obtenerPrecioRealSNIIM(product, 'DF'));
    if (r.disponible) {
      return {
        available: true, verified: true, label: `SNIIM real · corte ${r.fecha_corte_sniim}`, source: r.fuente, verification: 'sniim_real',
        note: r.nota || `Precio frecuente real de ${r.mercados.length} mercado(s) de ${r.estado}.`, state: r.estado || 'Nacional',
        markets: r.mercados.map((m) => m.mercado), urls: r.mercados.map((m) => m.url_consulta),
        variants: [{ id: r.producto, name: r.producto, origin: '', hours: hoursFor(product), min_c: Math.round(r.precio_min_kg * 100), max_c: Math.round(r.precio_max_kg * 100), freq_c: Math.round(r.precio_frecuente_kg * 100), national_freq_c: null, national_markets: null }],
      };
    }
  }
  // 2) Referencia del equipo (no verificada)
  const vars = variantsOf(product);
  if (!vars.length) return { available: false, reason: 'Sin referencia para este producto en el archivo del equipo.' };
  const st = REF.markets[state] ? state : 'Michoacán';
  const markets = REF.markets[st];
  const all = Object.values(REF.markets).flat();
  return {
    available: true,
    label: LABEL,
    source: REF.source_label,
    verification: REF.verification,
    note: REF.note,
    state: st,
    markets: markets.map((m) => m.market),
    variants: vars.map((v) => {
      const here = markets.map((m) => m.prices[v.id]).filter(Boolean);
      const nat = all.map((m) => m.prices[v.id]).filter(Boolean);
      return {
        id: v.id, name: v.name, origin: v.origin, hours: v.hours,
        min_c: here.length ? Math.min(...here.map((p) => c(p[0]))) : null,
        max_c: here.length ? Math.max(...here.map((p) => c(p[1]))) : null,
        freq_c: here.length ? median(here.map((p) => c(p[2]))) : null,
        national_freq_c: median(nat.map((p) => c(p[2]))),
        national_markets: nat.length,
      };
    }),
  };
}

/** Tabla completa de un estado (panel de administración). */
export function stateTable(state = 'Michoacán') {
  const st = REF.markets[state] ? state : 'Michoacán';
  return {
    label: LABEL, note: REF.note, state: st, states: STATES,
    rows: REF.markets[st].flatMap((m) => REF.catalog.map((v) => {
      const p = m.prices[v.id];
      return p ? { market: m.market, product: v.product, name: v.name, hours: v.hours, min_c: c(p[0]), max_c: c(p[1]), freq_c: c(p[2]) } : null;
    }).filter(Boolean)),
  };
}
