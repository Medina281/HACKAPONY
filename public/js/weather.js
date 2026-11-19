// Clima previsto por municipio con Open-Meteo (gratuito para uso no comercial, sin llave, datos CC BY 4.0).
// Se usan las coordenadas de la cabecera municipal: no se pide ni se envía la ubicación exacta del agricultor.
// Caché local de 1 hora para ahorrar datos móviles.
import { municipality } from './shared/catalog.js';

const TTL = 3600e3;
export const WEATHER_CREDIT = 'Clima: Open-Meteo.com (CC BY 4.0)';

export async function getForecast(muniId) {
  const m = municipality(muniId);
  if (!m) throw new Error('Municipio desconocido');
  const key = `rd_wx_${muniId}`;
  try {
    const c = JSON.parse(localStorage.getItem(key) || 'null');
    if (c && Date.now() - c.fetched_at < TTL) return trimToNow(c);
  } catch { /* caché dañada */ }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${m.lat}&longitude=${m.lng}` +
    '&hourly=temperature_2m,relative_humidity_2m&forecast_days=7&timezone=America%2FMexico_City&timeformat=unixtime';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('Servicio de clima no disponible');
    const d = await res.json();
    const data = {
      fetched_at: Date.now(), source: 'open-meteo', municipality: muniId,
      time: d.hourly.time.map((t) => t * 1000), temps: d.hourly.temperature_2m, humidity: d.hourly.relative_humidity_2m,
    };
    localStorage.setItem(key, JSON.stringify(data));
    return trimToNow(data);
  } finally {
    clearTimeout(timer);
  }
}

function trimToNow(d) {
  const now = Date.now();
  let i = d.time.findIndex((t) => t + 3600e3 > now);
  if (i < 0) i = 0;
  return { ...d, temps: d.temps.slice(i), humidity: d.humidity.slice(i) };
}

/** Alternativa sin internet: el agricultor elige cómo está el día. */
export const MANUAL_CLIMATES = [
  { id: 'fresco', label: '<svg class="i" aria-hidden="true"><use href="/icons.svg#cloud"/></svg> Fresco', temp: 15 },
  { id: 'templado', label: '<svg class="i" aria-hidden="true"><use href="/icons.svg#cloud-sun"/></svg> Templado', temp: 22 },
  { id: 'caluroso', label: '<svg class="i" aria-hidden="true"><use href="/icons.svg#sun"/></svg> Caluroso', temp: 30 },
];
export const manualForecast = (temp) => ({ source: 'usuario', temps: Array(168).fill(temp), humidity: [] });
