// sniimService.js — módulo listo para React / JavaScript con los precios REALES del SNIIM.
// 1) Corre:  python scraper_sniim_real.py   (genera sniim_real_verificado.json en esta carpeta)
// 2) Importa este módulo. En Vite/React también puedes usar:  import datos from './sniim_real_verificado.json';
//    (si tu herramienta no acepta "with { type: 'json' }", quítalo).
import datos from './sniim_real_verificado.json' with { type: 'json' };
import { crearServicioSNIIM } from '../../public/js/shared/sniim-core.js';

const servicio = crearServicioSNIIM(datos);

/** Catálogo único de productos reales extraídos del servidor, con sinónimos para voz a texto. */
export const catalogoSNIIM = servicio.catalogo;

/**
 * Precio frecuente REAL por kg en un estado (ej. "Michoacán"); si ese estado no cotizó, el promedio real nacional.
 * Devuelve también fuente, fecha de corte y URL de cada consulta para mostrarlos como respaldo verificable.
 */
export const obtenerPrecioRealSNIIM = (productoId, estado) => servicio.obtenerPrecioRealSNIIM(productoId, estado);

export const metadatosSNIIM = servicio.meta;
