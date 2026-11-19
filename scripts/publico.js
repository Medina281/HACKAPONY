// Arranca el servidor y crea un enlace público HTTPS gratuito (Cloudflare Quick Tunnel, sin cuenta).
// Así varias computadoras y celulares, en cualquier red, usan la app al mismo tiempo, y en el celular
// funcionan cámara y micrófono (los navegadores sólo los permiten con https).
// Uso: npm run publico   (en Windows PowerShell: npm.cmd run publico). Necesita internet.
// La computadora que lo ejecuta debe quedarse encendida; el enlace cambia cada vez que se reinicia.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const isWin = process.platform === 'win32';

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server.js')], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, PORT: String(PORT) },
});

function startTunnel(cmd, args) {
  const t = spawn(cmd, args, { cwd: ROOT, shell: isWin, env: process.env });
  let shown = false;
  const scan = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m && !shown) {
      shown = true;
      const line = '═'.repeat(m[0].length + 6);
      console.log(`\n  ╔${line}╗\n  ║   ${m[0]}   ║\n  ╚${line}╝`);
      console.log('  Abre ese enlace en cualquier celular o computadora (también fuera de tu Wi-Fi).');
      console.log('  Compártelo por WhatsApp con tu equipo y el jurado. Ctrl + C para detener todo.\n');
    }
  };
  t.stdout.on('data', scan);
  t.stderr.on('data', scan);
  return t;
}

// 1) cloudflared instalado (winget install Cloudflare.cloudflared)  2) si no, vía npx (descarga automática)
let tunnel = startTunnel('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
let fellBack = false;
const fallback = () => {
  if (fellBack) return;
  fellBack = true;
  console.log('  (cloudflared no está instalado; se usará npx cloudflared, la primera vez tarda un poco)');
  tunnel = startTunnel(isWin ? 'npx.cmd' : 'npx', ['-y', 'cloudflared', 'tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
  tunnel.on('error', () => {});
  tunnel.on('exit', (c) => c && console.log('  No se pudo crear el enlace público. Revisa tu internet o instala cloudflared: winget install Cloudflare.cloudflared'));
};
tunnel.on('error', fallback);
tunnel.on('exit', (code) => { if (code) fallback(); });

const stop = () => { try { tunnel.kill(); } catch {} try { server.kill(); } catch {} process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
