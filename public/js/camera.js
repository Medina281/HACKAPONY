// Cámara integrada: visor a pantalla completa con marco 4:3 y botón grande para disparar.
// Todas las fotos (de cámara o de galería, verticales u horizontales) se recortan al centro a 4:3,
// 960×720, JPEG ~70%: un solo formato en toda la interfaz y poco consumo de datos.
const W = 960;
const H = 720;

/** Recorta al centro a 4:3 y reduce. Acepta <video>, <img> o ImageBitmap. */
export function toStandard(src, sw, sh) {
  const target = W / H;
  let cw = sw;
  let ch = Math.round(sw / target);
  if (ch > sh) { ch = sh; cw = Math.round(sh * target); }
  const sx = Math.round((sw - cw) / 2);
  const sy = Math.round((sh - ch) / 2);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d').drawImage(src, sx, sy, cw, ch, 0, 0, W, H);
  return c.toDataURL('image/jpeg', 0.7);
}

/** Foto de galería → mismo formato estándar. */
export function standardizeFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(toStandard(img, img.naturalWidth, img.naturalHeight)); };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

export const canUseCamera = () => !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

/**
 * Abre el visor. Resuelve con la foto (dataURL) o null si se cancela.
 * Si no hay cámara o se niega el permiso, rechaza para que la vista use el selector del sistema.
 */
export async function takePhoto() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'cam';
    ov.innerHTML = `
      <div class="cam-top"><button type="button" class="cam-x" aria-label="Cerrar cámara"><svg class="i" aria-hidden="true"><use href="/icons.svg#x"/></svg></button><span>Encuadra el producto dentro del marco</span></div>
      <div class="cam-view"><video playsinline autoplay muted></video><div class="cam-frame" aria-hidden="true"></div></div>
      <div class="cam-bar">
        <button type="button" class="cam-alt" data-retry hidden><svg class="i" aria-hidden="true"><use href="/icons.svg#refresh"/></svg> Repetir</button>
        <button type="button" class="cam-shot" aria-label="Tomar foto"></button>
        <button type="button" class="cam-alt" data-use hidden><svg class="i" aria-hidden="true"><use href="/icons.svg#check"/></svg> Usar</button>
      </div>`;
    document.body.append(ov);
    const video = ov.querySelector('video');
    video.srcObject = stream;
    let photo = null;
    const stop = () => stream.getTracks().forEach((t) => t.stop());
    const done = (val) => { stop(); ov.remove(); resolve(val); };
    const preview = ov.querySelector('.cam-view');
    ov.querySelector('.cam-x').onclick = () => done(null);
    ov.querySelector('.cam-shot').onclick = () => {
      if (!video.videoWidth) return;
      photo = toStandard(video, video.videoWidth, video.videoHeight);
      preview.style.backgroundImage = `url(${photo})`;
      preview.classList.add('frozen');
      ov.querySelector('[data-retry]').hidden = false;
      ov.querySelector('[data-use]').hidden = false;
      ov.querySelector('.cam-shot').hidden = true;
    };
    ov.querySelector('[data-retry]').onclick = () => {
      photo = null;
      preview.classList.remove('frozen');
      preview.style.backgroundImage = '';
      ov.querySelector('[data-retry]').hidden = true;
      ov.querySelector('[data-use]').hidden = true;
      ov.querySelector('.cam-shot').hidden = false;
    };
    ov.querySelector('[data-use]').onclick = () => done(photo);
  });
}
