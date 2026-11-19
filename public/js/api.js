// Cliente HTTP con manejo uniforme de errores y detección de conexión.
export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

let serverOffset = 0; // diferencia reloj servidor − cliente (los temporizadores usan la hora del servidor)
export const serverNow = () => Date.now() + serverOffset;

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    document.body.classList.add('offline');
    throw new ApiError('Sin conexión. Revisa tu señal e intenta de nuevo.', 0);
  }
  const stale = res.headers.get('X-From-Cache') === '1';
  document.body.classList.toggle('offline', stale);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* respuesta vacía */
  }
  if (data.server_now && !stale) serverOffset = data.server_now - Date.now();
  if (!res.ok) throw new ApiError(data.error || 'Ocurrió un error', res.status, data.fields);
  if (stale) data._stale = true;
  return data;
}
