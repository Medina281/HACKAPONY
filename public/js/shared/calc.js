// Cálculos monetarios en ENTEROS para evitar errores de punto flotante.
// - Dinero: centavos (int). Precio por kg: centavos por kg.
// - Cantidad: gramos (int).

export const kgToGrams = (kg) => Math.round(Number(kg) * 1000);
export const gramsToKg = (g) => Math.round(g / 100) / 10; // 1 decimal
export const pesosToCents = (p) => Math.round(Number(p) * 100);

/** Importe de `grams` a `centsPerKg`, redondeado al centavo. */
export const amount = (grams, centsPerKg) => Math.round((grams * centsPerKg) / 1000);

/**
 * Precio habitual total = kg × precio habitual
 * Precio de rescate total = kg × precio de rescate
 * Ahorro = habitual − rescate
 */
export function orderTotals(grams, refCentsPerKg, rescueCentsPerKg) {
  const refTotal = amount(grams, refCentsPerKg);
  const rescueTotal = amount(grams, rescueCentsPerKg);
  return { refTotal, rescueTotal, savings: refTotal - rescueTotal };
}

/** Descuento % = (habitual − rescate) / habitual × 100, con un decimal. */
export function discountPct(refCentsPerKg, rescueCentsPerKg) {
  if (!refCentsPerKg || refCentsPerKg <= 0) return 0;
  return Math.round(((refCentsPerKg - rescueCentsPerKg) / refCentsPerKg) * 1000) / 10;
}

/** Ahorro neto estimado restando costo de traslado (ida y vuelta). */
export function netSavings({ savingsCents, distanceKm, kmPerLiter, pricePerLiterCents, roundTrip = true }) {
  const km = distanceKm * (roundTrip ? 2 : 1);
  const liters = kmPerLiter > 0 ? km / kmPerLiter : 0;
  const transportCents = Math.round(liters * pricePerLiterCents);
  return { transportCents, netCents: savingsCents - transportCents, km: Math.round(km * 10) / 10 };
}

export function formatMXN(cents) {
  const neg = cents < 0;
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString('es-MX', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${neg ? '−' : ''}$${s}`;
}

export function formatKg(grams) {
  const kg = grams / 1000;
  return `${kg.toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg`;
}

/** Distancia en línea recta (Haversine), km. */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

// Las carreteras rara vez son rectas: factor de rodeo ESTIMADO (no es una ruta real).
export const ROAD_FACTOR = 1.3;

export function formatRemaining(ms) {
  if (ms <= 0) return 'Vencido';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h >= 48) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
