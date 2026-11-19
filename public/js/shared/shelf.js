// Estimación ORIENTATIVA de vida útil comercial según el clima.
// Método (versión "q10-v1"):
//  1. Clase de perecibilidad por tasa de respiración (Kader, Postharvest Technology of Horticultural Crops;
//     material del curso de poscosecha UF/IFAS). Productos que la fuente no clasifica → "moderada" (supuesto).
//  2. Horas de referencia a 20 °C por clase: SUPUESTO DEL PROTOTIPO, a calibrar con productores e INIFAP.
//  3. Ajuste por estado declarado (maduro y "próximo" duran menos): SUPUESTO DEL PROTOTIPO.
//  4. Ajuste por temperatura con la tabla típica Q10 de vida útil relativa
//     (0 °C: 100, 10 °C: 33, 20 °C: 13, 30 °C: 7, 40 °C: 4), interpolada.
// No certifica inocuidad. El agricultor decide las horas que publica.
import { normalize } from './catalog.js';

export const METHOD = 'q10-v1';

export const CLASS_LABEL = {
  baja: 'Perecibilidad baja',
  moderada: 'Perecibilidad moderada',
  alta: 'Perecibilidad alta',
  muy_alta: 'Perecibilidad muy alta',
  extrema: 'Perecibilidad extremadamente alta',
};

// Fuente: clasificación por respiración (Kader). guayaba no aparece → supuesto "moderada".
const CLASS_BY_PRODUCT = {
  jitomate: 'moderada', aguacate: 'alta', fresa: 'alta', guayaba: 'moderada*', limon: 'baja', mango: 'moderada',
  calabacita: 'moderada', cebolla: 'baja', papa: 'baja', platano: 'moderada', chile: 'moderada', zanahoria: 'moderada',
  elote: 'extrema', brocoli: 'muy_alta', lechuga: 'moderada', naranja: 'baja',
};

// Horas de referencia a 20 °C, producto en buen estado (SUPUESTO calibrable).
export const BASE_HOURS_20C = { baja: 240, moderada: 120, alta: 60, muy_alta: 36, extrema: 24 };
export const QUALITY_FACTOR = { excedente: 1, imperfeccion: 0.85, maduro: 0.45, proximo: 0.25 };

// Vida útil relativa típica según temperatura (tabla Q10 de material de poscosecha).
const LIFE_TABLE = [[0, 100], [10, 33], [20, 13], [30, 7], [40, 4]];

export function relativeLife(tempC) {
  const t = Math.max(0, Math.min(40, tempC));
  for (let i = 0; i < LIFE_TABLE.length - 1; i++) {
    const [t1, l1] = LIFE_TABLE[i];
    const [t2, l2] = LIFE_TABLE[i + 1];
    if (t <= t2) {
      const f = (t - t1) / (t2 - t1);
      return Math.exp(Math.log(l1) + f * (Math.log(l2) - Math.log(l1))); // interpolación logarítmica
    }
  }
  return 4;
}

export function perishClass(product) {
  const c = CLASS_BY_PRODUCT[normalize(product || '')] || 'moderada*';
  return { cls: c.replace('*', ''), assumed: c.endsWith('*') };
}

/**
 * @param {object} p
 * @param {string} p.product
 * @param {string} p.quality
 * @param {number[]} p.temps  temperaturas horarias previstas (°C) desde ahora; o una sola si la eligió el usuario
 * @param {number[]} [p.humidity]
 */
export function estimateShelfLife({ product, quality, temps, humidity = [] }) {
  if (!product || !QUALITY_FACTOR[quality] || !temps?.length) return null;
  const { cls, assumed } = perishClass(product);
  const base = BASE_HOURS_20C[cls] * QUALITY_FACTOR[quality];
  const meanOf = (arr, n) => {
    const a = arr.slice(0, Math.max(1, Math.round(n)));
    return a.reduce((s, x) => s + x, 0) / a.length;
  };
  // Dos pasadas: la temperatura promedio depende de cuántas horas dure el producto.
  let hours = base;
  let tMean = meanOf(temps, 24);
  for (let i = 0; i < 2; i++) {
    hours = base * (relativeLife(tMean) / relativeLife(20));
    tMean = meanOf(temps, Math.min(hours, temps.length));
  }
  const window = temps.slice(0, Math.max(1, Math.round(Math.min(hours, temps.length))));
  const tMax = Math.max(...window);
  const hotHours = window.filter((x) => x >= 30).length;
  const rh = humidity.length ? Math.round(meanOf(humidity, window.length)) : null;
  const notes = [];
  if (hotHours) notes.push(`${hotHours} h previstas a 30 °C o más: guárdalo a la sombra y ventilado.`);
  if (rh != null && rh < 45) notes.push('Aire seco: el producto puede deshidratarse o marchitarse más rápido.');
  if (assumed) notes.push('Este producto no está en la clasificación de referencia; se usó perecibilidad moderada.');
  const h = Math.max(1, Math.min(168, Math.round(hours)));
  return {
    hours: h,
    low: Math.max(1, Math.round(h * 0.7)),
    high: Math.min(168, Math.round(h * 1.3)),
    temp_mean: Math.round(tMean * 10) / 10,
    temp_max: Math.round(tMax * 10) / 10,
    humidity: rh,
    cls,
    method: METHOD,
    notes,
  };
}

/** Fase de vida útil según el tiempo transcurrido desde la publicación. */
export function shelfPhase(createdAt, expiresAt, now) {
  const total = expiresAt - createdAt;
  const used = Math.min(1, Math.max(0, (now - createdAt) / total));
  const phase = used >= 1 ? 'vencido' : used >= 0.8 ? 'ultimo' : used >= 0.5 ? 'pronto' : 'fresco';
  return { used, phase };
}
export const PHASE_LABEL = { fresco: 'Fresco', pronto: 'Usar pronto', ultimo: 'Último momento', vencido: 'Ventana terminada' };
