// Precio automático de Raíz Directa (regla "tramos-v1").
// El agricultor sólo dice SU precio por kilo y cuántas horas de frescura tiene el producto.
// La app pone el precio de rescate sola y lo va bajando por tramos conforme pasan esas horas.
// Los porcentajes son una REGLA DE LA PLATAFORMA (decisión del equipo, ajustable), no un dato de mercado.
export const PRICE_RULE = 'tramos-v1';
export const TIERS = [
  { until: 0.25, off: 20 },
  { until: 0.5, off: 30 },
  { until: 0.75, off: 40 },
  { until: 1, off: 50 },
];

const round50 = (c) => Math.max(50, Math.round(c / 50) * 50); // a 50 centavos

/** Precio de rescate en centavos para un % de descuento. */
export const priceFor = (refCents, off) => Math.max(50, Math.min(round50(refCents * (1 - off / 100)), refCents - 50));

/** Tramo vigente según el momento dentro de la vida útil declarada. */
export function priceAt(refCents, createdAt, expiresAt, now) {
  const life = Math.max(1, expiresAt - createdAt);
  const f = Math.min(0.9999, Math.max(0, (now - createdAt) / life));
  const i = TIERS.findIndex((t) => f < t.until);
  const tier = TIERS[i];
  const next = TIERS[i + 1];
  return {
    cents: priceFor(refCents, tier.off),
    off: tier.off,
    tier: i,
    next_at: next ? createdAt + Math.round(life * tier.until) : null,
    next_cents: next ? priceFor(refCents, next.off) : null,
    next_off: next ? next.off : null,
  };
}

/** Calendario completo de precios (para mostrarlo antes de publicar y en la oferta). */
export function schedule(refCents, createdAt, expiresAt) {
  const life = expiresAt - createdAt;
  let from = createdAt;
  return TIERS.map((t) => {
    const to = createdAt + Math.round(life * t.until);
    const row = { from, to, off: t.off, cents: priceFor(refCents, t.off) };
    from = to;
    return row;
  });
}
