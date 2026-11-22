import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = await createApp();
app.server.on('error', error => { console.error(error.message); process.exit(1); });
await new Promise(resolve => app.server.listen(4317, '127.0.0.1', resolve));
const vite = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))], { cwd: root, stdio: 'inherit' });
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  vite.kill(); await app.close(); process.exit(code);
}
vite.on('exit', code => stop(code || 0));
vite.on('error', error => { console.error(error.message); stop(1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
