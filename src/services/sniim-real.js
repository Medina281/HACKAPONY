// Si existe src/data/sniim_real_verificado.json (salida del scraper), la app usa esos precios REALES del SNIIM
// con su fecha de corte y URL de consulta. Si no existe, no se inventa nada: se usa la consulta en vivo y la
// referencia del equipo (marcada como no verificada).
import fs from 'node:fs';
import { crearServicioSNIIM } from '../../public/js/shared/sniim-core.js';

const FILE = new URL('../data/sniim_real_verificado.json', import.meta.url);
let cache = null;
let mtime = 0;

export function realService() {
  try {
    const st = fs.statSync(FILE);
    if (!cache || st.mtimeMs !== mtime) {
      cache = crearServicioSNIIM(JSON.parse(fs.readFileSync(FILE, 'utf8')));
      mtime = st.mtimeMs;
    }
    return cache.hayDatos ? cache : null;
  } catch {
    return null;
  }
}
