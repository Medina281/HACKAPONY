// Descarga fotos REALES de productos desde Wikimedia Commons (licencias libres) y las guarda en el proyecto.
// Uso (necesita internet una sola vez):  npm run fotos      → en Windows PowerShell: npm.cmd run fotos
// Resultado: public/img/productos/<producto>.jpg + creditos.json (autor, licencia y enlace de cada foto).
// Sólo acepta CC0, dominio público, CC BY y CC BY-SA (nunca NC ni ND).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'productos');
const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia exige un User-Agent con datos de contacto (URL o correo); sin él responde 403.
const UA = `RaizDirecta/1.0 (https://github.com/Medina281/HACKAPONY; prototipo educativo HackPony 2026) node/${process.versions.node}`;
const WIDTH = 800;

// Archivos preferidos (verificados) y búsquedas de respaldo por producto.
const WANT = {
  jitomate: { files: ['Tomatoes.jpg'], search: 'roma tomatoes' },
  aguacate: { files: ['Avocado Hass - single and halved.jpg'], search: 'hass avocado fruit' },
  fresa: { files: ['Garden strawberry (Fragaria × ananassa) single2.jpg', 'Strawberry444.jpg'], search: 'strawberries fruit' },
  guayaba: { files: ['Goiaba vermelha.jpg', 'Psidium guajava fruit.jpg'], search: 'guava fruit' },
  limon: { files: ['Lime - whole and halved.jpg'], search: 'key lime fruit' },
  mango: { files: ['Mangos - single and halved.jpg'], search: 'mango fruit ripe' },
  calabacita: { files: ['Zucchini in basket 2021 G1.jpg'], search: 'zucchini vegetable' },
  cebolla: { files: ['YellowOnions.jpg', 'Onion on White.JPG'], search: 'white onions' },
  papa: { files: ['Potato tubers.jpg', 'Potato tubers in pail.jpg'], search: 'potatoes tubers' },
  platano: { files: ['Bunch of bananas on sale.jpg'], search: 'bananas bunch fruit' },
  chile: { files: ['Serrano peppers at county fair.jpg'], search: 'serrano peppers' },
  zanahoria: { files: ['Carrots of many colors.jpg'], search: 'carrots vegetable' },
  elote: { files: ['Liat Portal for Foodie Disorder - Fresh Corn on the Cob.jpg'], search: 'corn on the cob ears' },
  brocoli: { files: ['Fire-Tuscarora Organic Growers - Broccoli head.jpg'], search: 'broccoli vegetable' },
  lechuga: { files: ['Romaine lettuce.jpg'], search: 'romaine lettuce' },
  naranja: { files: ['Oranges - whole-halved-segment.jpg'], search: 'oranges fruit' },
};

const OK_LICENSE = /^(cc0|cc[ -]by([ -]sa)?(\s*[\d.]+)?|public domain|pd\b|dominio p)/i;
const BAD_LICENSE = /\bnc\b|\bnd\b|non-?commercial|no derivatives|fair use/i;
const clean = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function get(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(25000) });
      if (res.ok) return res;
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      last = new Error(`HTTP ${res.status} ${body}`);
      if (res.status === 404) break;
    } catch (e) {
      last = new Error(e.cause?.code || e.message);
    }
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
  }
  throw last;
}

async function api(params) {
  const url = `${API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })}`;
  const text = await (await get(url)).text();
  try { return JSON.parse(text); } catch {
    const title = (text.match(/<title>([^<]*)<\/title>/i) || [])[1] || text.slice(0, 80);
    throw new Error(`Commons respondió una página en lugar de datos: ${title.trim()}`);
  }
}

const INFO = { prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: String(WIDTH) };

function pick(pages) {
  for (const p of pages || []) {
    const ii = p.imageinfo?.[0];
    if (!ii || p.missing) continue;
    if (!/image\/(jpeg|png)/.test(ii.mime)) continue;
    if (ii.width < 600) continue;
    const lic = clean(ii.extmetadata?.LicenseShortName?.value);
    if (!OK_LICENSE.test(lic) || BAD_LICENSE.test(lic)) continue;
    return {
      title: p.title.replace(/^File:/, ''),
      thumb: ii.thumburl || ii.url,
      page: ii.descriptionurl,
      license: lic,
      license_url: clean(ii.extmetadata?.LicenseUrl?.value) || null,
      author: clean(ii.extmetadata?.Artist?.value) || 'ver ficha en Commons',
      mime: ii.mime,
    };
  }
  return null;
}

async function findPhoto(spec) {
  if (spec.files.length) {
    const d = await api({ ...INFO, titles: spec.files.map((f) => `File:${f}`).join('|') });
    // conservar el orden de preferencia
    const pages = spec.files.map((f) => d.query?.pages?.find((p) => p.title.replace(/^File:/, '').replace(/_/g, ' ') === f.replace(/_/g, ' '))).filter(Boolean);
    const hit = pick(pages);
    if (hit) return hit;
  }
  const d = await api({ ...INFO, generator: 'search', gsrnamespace: '6', gsrlimit: '15', gsrsearch: `${spec.search} filetype:bitmap` });
  const pages = (d.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pick(pages);
}

async function main() {
  // Prueba rápida de conexión para dar un mensaje claro si algo bloquea la red.
  try {
    await get(`${API}?action=query&meta=siteinfo&format=json`, 1);
  } catch (e) {
    console.error(`No se pudo conectar con Wikimedia Commons (${e.message}).`);
    console.error('Revisa tu internet. Si usas VPN, proxy o la red de la escuela, prueba con otra red (por ejemplo, datos del celular).');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const credFile = path.join(OUT, 'creditos.json');
  const credits = fs.existsSync(credFile) ? JSON.parse(fs.readFileSync(credFile, 'utf8')) : {};
  const only = process.argv.slice(2).map((s) => s.toLowerCase());
  let ok = 0;
  for (const [slug, spec] of Object.entries(WANT)) {
    if (only.length && !only.includes(slug)) continue;
    process.stdout.write(`· ${slug.padEnd(11)} `);
    try {
      const p = await findPhoto(spec);
      if (!p) { console.log('sin foto con licencia libre (se usará ícono)'); continue; }
      const res = await get(p.thumb);
      const ext = p.mime === 'image/png' ? 'png' : 'jpg';
      const file = `${slug}.${ext}`;
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(OUT, file), buf);
      credits[slug] = { file, source_file: p.title, author: p.author, license: p.license, license_url: p.license_url, page: p.page, downloaded_at: new Date().toISOString() };
      console.log(`OK  ${Math.round(buf.length / 1024)} KB · ${p.license} · ${p.author.slice(0, 40)} · ${p.title.slice(0, 50)}`);
      ok++;
      await new Promise((r) => setTimeout(r, 400)); // ser amables con Commons
    } catch (e) {
      console.log(`error: ${e.message}`);
    }
  }
  fs.writeFileSync(credFile, JSON.stringify(credits, null, 2));
  console.log(`\n${ok} fotos descargadas en public/img/productos. Créditos en la app: /#/creditos`);
  console.log('Revisa que cada foto corresponda al producto; si alguna no te gusta, bórrala y vuelve a correr: npm run fotos <producto>');
}

main().catch((e) => {
  console.error('No se pudieron descargar las fotos:', e.message, '\n¿Hay internet en esta computadora?');
  process.exit(1);
});
