import { bad } from './http.js';
import { CATEGORIES, MUNICIPALITIES, QUALITY } from '../public/js/shared/catalog.js';
import { kgToGrams, pesosToCents } from '../public/js/shared/calc.js';

const str = (v, max = 200) => (v == null ? '' : String(v).trim().slice(0, max));
const num = (v) => (v === '' || v == null ? NaN : Number(String(v).replace(',', '.')));

export function validateLot(b) {
  const e = {};
  const product = str(b.product, 60);
  if (product.length < 2) e.product = 'Escribe qué producto es';

  const kg = num(b.kg);
  if (!Number.isFinite(kg) || kg <= 0) e.kg = 'La cantidad debe ser mayor a 0 kg';
  else if (kg > 50000) e.kg = 'Máximo 50,000 kg por lote';

  const ref = num(b.ref_price);
  const rescue = num(b.rescue_price);
  if (!Number.isFinite(ref) || ref <= 0) e.ref_price = 'Indica tu precio habitual por kg';
  else if (ref > 2000) e.ref_price = 'Precio fuera de rango (máx. $2,000/kg)';
  if (!Number.isFinite(rescue) || rescue <= 0) e.rescue_price = 'Indica el precio de rescate por kg';
  else if (Number.isFinite(ref) && rescue >= ref) e.rescue_price = 'El precio de rescate debe ser menor al habitual';

  const hours = num(b.hours);
  if (!Number.isFinite(hours) || hours <= 0) e.hours = 'Indica cuántas horas le quedan de frescura';
  else if (hours < 1) e.hours = 'Mínimo 1 hora para que alguien pueda recogerlo';
  else if (hours > 168) e.hours = 'Máximo 7 días (168 horas)';

  let minKg = b.min_kg === '' || b.min_kg == null ? null : num(b.min_kg);
  if (minKg != null && (!Number.isFinite(minKg) || minKg <= 0)) e.min_kg = 'La compra mínima debe ser mayor a 0';
  else if (minKg != null && Number.isFinite(kg) && minKg > kg) e.min_kg = 'La compra mínima no puede ser mayor que el lote';

  const quality = b.quality;
  if (!quality) e.quality = 'Indica cómo está el producto';
  else if (quality === 'no_apto') e.quality = 'Los productos no aptos para consumo no se pueden publicar';
  else if (!QUALITY.some((q) => q.id === quality)) e.quality = 'Estado no válido';

  const category = b.category || 'otro';
  if (!CATEGORIES.some((c) => c.id === category)) e.category = 'Categoría no válida';

  const municipality = b.municipality;
  if (!MUNICIPALITIES.some((m) => m.id === municipality)) e.municipality = 'Selecciona un municipio';

  if (b.declaration !== true) e.declaration = 'Confirma que el producto es apto para consumo';

  if (Object.keys(e).length) throw bad('Revisa los datos marcados', e);

  const total_g = kgToGrams(kg);
  const allow_partial = b.allow_partial === false ? 0 : 1;
  return {
    product: product[0].toUpperCase() + product.slice(1),
    category,
    quality,
    total_g,
    min_g: allow_partial ? (minKg ? kgToGrams(minKg) : Math.min(1000, total_g)) : total_g,
    allow_partial,
    ref_price_c: pesosToCents(ref),
    rescue_price_c: pesosToCents(rescue),
    fresh_hours: Math.round(hours * 2) / 2,
    municipality,
    pickup_point: str(b.pickup_point, 160) || null,
    pickup_window: str(b.pickup_window, 80) || null,
    producer_transport: b.producer_transport ? 1 : 0,
    notes: str(b.notes, 400) || null,
    input_method: ['voz', 'frase'].includes(b.input_method) ? b.input_method : 'formulario',
    shelf_json: sanitizeShelf(b.shelf),
  };
}

/** Guarda sólo números en rango y textos conocidos de la estimación de vida útil (dato informativo). */
function sanitizeShelf(s) {
  if (!s || typeof s !== 'object') return null;
  const n = (v, lo, hi) => (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Math.round(Number(v) * 10) / 10 : null);
  const out = {
    hours: n(s.hours, 1, 168), low: n(s.low, 1, 168), high: n(s.high, 1, 168),
    temp_mean: n(s.temp_mean, -15, 50), temp_max: n(s.temp_max, -15, 55), humidity: n(s.humidity, 0, 100),
    cls: ['baja', 'moderada', 'alta', 'muy_alta', 'extrema'].includes(s.cls) ? s.cls : null,
    source: ['open-meteo', 'usuario'].includes(s.source) ? s.source : null,
    method: s.method === 'q10-v1' ? s.method : null,
  };
  return out.hours && out.source && out.method ? JSON.stringify(out) : null;
}

export function validatePhone(p) {
  const d = String(p || '').replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '');
  return /^\d{10}$/.test(d) ? d : null;
}

export function validateRegistration(b) {
  const e = {};
  const role = b.role;
  if (!['productor', 'comprador', 'transportista'].includes(role)) e.role = 'Elige si vendes, compras o transportas';
  const name = str(b.name, 80);
  if (name.length < 2) e.name = 'Escribe tu nombre';
  const phone = validatePhone(b.phone);
  if (!phone) e.phone = 'Teléfono de 10 dígitos';
  const email = str(b.email, 120).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Correo no válido';
  const password = String(b.password || '');
  if (password.length < 8) e.password = 'Mínimo 8 caracteres';
  if (!MUNICIPALITIES.some((m) => m.id === b.municipality)) e.municipality = 'Selecciona tu municipio';
  const business_name = str(b.business_name, 80) || (role === 'comprador' ? name || null : null);
  const capacity = b.capacity_kg === '' || b.capacity_kg == null ? null : Math.round(num(b.capacity_kg));
  if (role === 'transportista' && (!capacity || capacity <= 0 || capacity > 40000)) e.capacity_kg = 'Indica cuántos kilos carga tu vehículo';
  if (Object.keys(e).length) throw bad('Revisa los datos marcados', e);
  return {
    vehicle: role === 'transportista' ? str(b.vehicle, 60) || 'Camioneta' : null,
    capacity_kg: role === 'transportista' ? capacity : null,
    refrigerated: role === 'transportista' && b.refrigerated ? 1 : 0,
    role, name, phone, email, password, municipality: b.municipality, business_name,
    business_type: str(b.business_type, 40) || null, pickup_point: str(b.pickup_point, 160) || null,
  };
}

export { str, num };
