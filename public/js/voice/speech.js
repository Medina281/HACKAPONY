// Envoltura de la Web Speech API (gratuita, del navegador). Sin servicios de pago.
// Nota de privacidad: en Chrome el reconocimiento se procesa en servidores de Google;
// Raíz Directa no graba ni guarda audio ni transcripciones.

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
// Navegadores que exponen la API pero no transcriben (Opera/Opera GX, Brave, Firefox, app de escritorio Electron).
export const brokenRecognizer = /\bOPR\/|OPRGX|Electron\/|Firefox\//.test(UA) || (typeof navigator !== 'undefined' && !!navigator.brave);
export const canRecognize = !!SR && !brokenRecognizer;
export const isAndroid = /Android/i.test(UA);
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export const ERROR_TEXT = {
  'not-allowed': 'No tengo permiso para usar el micrófono. Puedes activarlo en el candado junto a la dirección del sitio, o escribirme.',
  'service-not-allowed': 'Este navegador no permite el dictado aquí. Escríbeme tu respuesta.',
  'audio-capture': 'No encontré un micrófono en este teléfono. Escríbeme tu respuesta.',
  network: 'El dictado necesita internet y la señal falló. Escríbeme o intenta de nuevo.',
  'no-speech': 'No alcancé a escucharte. Intenta de nuevo, un poco más cerca del teléfono.',
  aborted: null,
  'language-not-supported': 'Este navegador no reconoce español de México. Escríbeme tu respuesta.',
};

/** Crea un reconocedor es-MX con transcripción en tiempo real. */
export function createRecognizer({ onText, onEnd, onError }) {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'es-MX';
  rec.interimResults = true;
  // En Android el modo continuo duplica el texto: ahí se dicta una frase y se envía sola al terminar de hablar.
  rec.continuous = !isAndroid;
  rec.maxAlternatives = 1;
  let finalText = '';
  let cancelled = false;
  rec.onresult = (ev) => {
    let interim = '';
    finalText = '';
    for (const r of ev.results) (r.isFinal ? (finalText += r[0].transcript + ' ') : (interim += r[0].transcript));
    onText((finalText + interim).trim(), !interim);
  };
  rec.onerror = (ev) => onError?.(ev.error);
  rec.onend = () => onEnd?.(cancelled ? '' : finalText.trim());
  return {
    start: () => { cancelled = false; finalText = ''; rec.start(); },
    stop: () => { try { rec.stop(); } catch { /* ya terminó */ } },
    cancel: () => { cancelled = true; try { rec.abort(); } catch { /* ya terminó */ } },
  };
}

let voice = null;
function pickVoice() {
  if (voice || !canSpeak) return voice;
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => v.lang === 'es-MX') || vs.find((v) => v.lang?.startsWith('es-US')) || vs.find((v) => v.lang?.startsWith('es')) || null;
  return voice;
}
if (canSpeak) speechSynthesis.onvoiceschanged = () => { voice = null; pickVoice(); };

/** Lee un texto en voz alta (si el navegador lo permite). Nunca bloquea el flujo. */
export function speak(text) {
  if (!canSpeak || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, '').replace(/[*_~]/g, ''));
    u.lang = 'es-MX';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 0.98;
    speechSynthesis.speak(u);
  } catch { /* sin síntesis: sólo texto */ }
}
export const stopSpeaking = () => canSpeak && speechSynthesis.cancel();
