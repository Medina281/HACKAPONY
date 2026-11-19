// Compartir la ubicación del transportista mientras va en camino (Geolocation API del navegador, gratuita).
// Sigue activo aunque cambie de pantalla dentro de la app; se detiene al entregar, al tocar "Dejar de compartir"
// o si el servidor responde que la entrega ya no está en camino. La pantalla debe quedarse abierta:
// los navegadores pausan la ubicación de páginas web en segundo plano.
import { api } from './api.js';

const S = { id: null, watch: null, lock: null, last: null, error: null, sent: 0, listeners: new Set() };
const emit = () => S.listeners.forEach((f) => f(status()));
export const status = () => ({ id: S.id, active: S.watch != null, last: S.last, error: S.error, sent: S.sent });
export const onChange = (f) => (S.listeners.add(f), () => S.listeners.delete(f));
export const canShare = () => 'geolocation' in navigator;

async function keepAwake() {
  try { S.lock = await navigator.wakeLock?.request('screen'); } catch { /* opcional */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.watch != null && !S.lock) keepAwake(); });

export function start(id) {
  if (!canShare()) { S.error = 'Este teléfono no permite compartir ubicación.'; emit(); return false; }
  if (S.watch != null && S.id === id) return true;
  stop();
  S.id = id;
  S.error = null;
  S.watch = navigator.geolocation.watchPosition(
    async (p) => {
      S.last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
      S.error = null;
      emit();
      try {
        await api(`/api/deliveries/${id}/position`, { method: 'POST', body: { lat: S.last.lat, lng: S.last.lng, acc: S.last.acc } });
        S.sent++;
      } catch (err) {
        if (err.status === 409 || err.status === 403) stop(); // ya se entregó o se canceló
        else S.error = err.message;
      }
      emit();
    },
    (err) => {
      S.error = err.code === 1 ? 'No diste permiso de ubicación. Actívalo en el candado junto a la dirección.' : 'No se pudo obtener tu ubicación; revisa que el GPS esté encendido.';
      if (err.code === 1) stop();
      emit();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  keepAwake();
  emit();
  return true;
}

export function stop() {
  if (S.watch != null) navigator.geolocation.clearWatch(S.watch);
  S.watch = null;
  S.lock?.release?.().catch(() => {});
  S.lock = null;
  emit();
}
