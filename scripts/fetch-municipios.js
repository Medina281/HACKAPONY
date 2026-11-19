// Descarga el catálogo REAL de estados y municipios de México del INEGI (Catálogo Único de Claves
// Geoestadísticas, servicio wscatgeo) con las coordenadas de la cabecera municipal de cada uno.
// Uso (necesita internet una sola vez):  npm run municipios      → en Windows: npm.cmd run municipios
// Resultado: src/data/municipios-inegi.json  (≈2,478 municipios, 32 estados). Luego: git add, commit y push.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'municipios-inegi.json');
const API = 'https://gaia.inegi.org.mx/wscatgeo/v2';
const UA = 'RaizDirecta/1.0 (prototipo HackPony 2026; https://github.com/Medina281/HACKAPONY)';

async function get(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      const t = await r.text();
      if (r.ok) return JSON.parse(t);
      last = new Error(`HTTP ${r.status}`);
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  throw last;
}
const r4 = (x) => Math.round(Number(x) * 1e4) / 1e4;

async function main() {
  const estados = (await get(`${API}/mgee/`)).datos.map((e) => ({ cve: e.cve_ent, nombre: e.nomgeo }));
  console.log(`${estados.length} estados`);
  const muns = [];
  for (const e of estados) {
    const d = (await get(`${API}/mgem/${e.cve}`)).datos;
    for (const m of d) muns.push({ ent: e.cve, mun: m.cve_mun, nombre: m.nomgeo, cab: m.cve_cab, pob: Number(m.pob_total) || 0 });
    process.stdout.write(`\r${muns.length} municipios…`);
  }
  console.log('\nBuscando la cabecera municipal de cada uno (coordenadas)…');
  const rows = [];
  const faltan = [];
  let i = 0;
  let done = 0;
  const worker = async () => {
    while (i < muns.length) {
      const m = muns[i++];
      let loc = null;
      let best = null;
      for (const amb of ['U', 'R']) {
        const d = await get(`${API}/localidades/${m.ent}/${m.mun}/${amb}`).catch(() => null);
        for (const x of d?.datos || []) if (!best || +x.pob_total > +best.pob_total) best = x;
        loc = d?.datos?.find((x) => x.cve_loc === m.cab);
        if (loc) break;
      }
      const p = loc || best; // si la cabecera no aparece (alcaldías de CDMX), la localidad más poblada
      if (p) rows.push([m.ent + m.mun, m.nombre, r4(p.latitud), r4(p.longitud), m.pob]);
      else faltan.push(`${m.ent}${m.mun} ${m.nombre}`);
      if (++done % 100 === 0) process.stdout.write(`\r${done}/${muns.length}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    fuente: 'INEGI. Catálogo Único de Claves Geoestadísticas (wscatgeo v2) y Censo de Población y Vivienda 2020.',
    url: `${API}/`, generado_en: new Date().toISOString(),
    campos: ['cvegeo', 'nombre', 'lat_cabecera', 'lng_cabecera', 'poblacion_2020'],
    estados, municipios: rows,
  }));
  console.log(`\n✔ ${rows.length} municipios guardados en src/data/municipios-inegi.json${faltan.length ? ` · sin coordenadas: ${faltan.join(', ')}` : ''}`);
}

main().catch((e) => {
  console.error('No se pudo descargar del INEGI:', e.message, '\n¿Hay internet en esta computadora?');
  process.exit(1);
});
