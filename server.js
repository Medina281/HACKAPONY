import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DB = process.env.DB_PATH || path.join(ROOT, 'data', 'raiz.db');

// Primera ejecución en una computadora o servidor nuevo: crea los datos de demostración automáticamente.
if (!fs.existsSync(DB)) {
  const { seed } = await import('./scripts/seed.js');
  seed(DB);
  console.log('  Base de datos de demostración creada (datos ficticios).');
}

const { server } = createApp({ dbPath: DB });

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
  console.log(`\n  Raíz Directa en marcha (puerto ${PORT})`);
  console.log(`  · En esta computadora:        http://localhost:${PORT}`);
  for (const i of lan) console.log(`  · Otros equipos en tu Wi-Fi:  http://${i.address}:${PORT}`);
  console.log('  · Enlace https para celulares y cualquier lugar: usa  npm run publico');
  console.log('  Cuentas demo (contraseña demo1234): productor 4430000001 · comprador 4430000101 · transportista 4430000201 · admin 4430000999\n');
});
