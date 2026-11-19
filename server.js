import os from 'node:os';
import { createApp } from './src/app.js';

const PORT = Number(process.env.PORT) || 3000;
const { server } = createApp({ dbPath: process.env.DB_PATH });

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  console.log(`\n  🌱 Raíz Directa en http://localhost:${PORT}`);
  if (lan) console.log(`     Desde el celular (misma red Wi-Fi): http://${lan.address}:${PORT}`);
  console.log('     Cuentas demo: productor 4430000001 · comprador 4430000101 · admin 4430000999 (contraseña: demo1234)\n');
});
