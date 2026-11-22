import { createApp } from './app.mjs';

const app = await createApp();
app.server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Порт 4317 занят. Закройте другой экземпляр ProjiSpace.' : error.message);
  process.exitCode = 1;
});
app.server.listen(4317, '127.0.0.1', () => console.log('ProjiSpace: http://127.0.0.1:4317'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
