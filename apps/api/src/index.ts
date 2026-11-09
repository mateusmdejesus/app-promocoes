import { AppleJwtVerifier, LogEmailSender, ResendEmailSender } from './auth';
import { buildAdapters, config } from './config';
import { openDb } from './db';
import { runMonitor } from './monitor';
import { ExpoPushSender } from './push';
import { Repo } from './repo';
import { buildServer } from './server';

const repo = new Repo(openDb(config.databasePath));
const adapters = buildAdapters();
const sender = new ExpoPushSender();

let running = false;
async function tick() {
  if (running) return; // uma varredura lenta não pode se sobrepor à próxima
  running = true;
  try {
    const r = await runMonitor(repo, adapters, sender);
    console.log(`[monitor] ${r.scanned} produtos, ${r.newDeals} ofertas novas, ${r.pushesSent} notificações${r.errors.length ? `, erros: ${r.errors.join('; ')}` : ''}`);
  } catch (e) {
    console.error('[monitor] falhou:', e);
  } finally {
    running = false;
  }
}

const app = buildServer(repo, {
  email: config.resendApiKey ? new ResendEmailSender(config.resendApiKey, config.emailFrom) : new LogEmailSender(),
  apple: config.appleBundleId ? new AppleJwtVerifier(config.appleBundleId) : undefined,
  revenuecatAuth: config.revenuecatWebhookAuth || undefined,
  allowDevPurchases: config.allowDevPurchases,
});
if (!config.resendApiKey) console.log('[auth] RESEND_API_KEY vazio: os códigos de login aparecem aqui no terminal.');
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`keropromo API em http://localhost:${config.port}`);
await tick();
setInterval(tick, config.monitorIntervalMin * 60_000);
