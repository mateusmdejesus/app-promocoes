import { AppleJwtVerifier, LogEmailSender, ResendEmailSender } from './auth';
import { DevPix, MercadoPagoPix } from './billing';
import { buildAdapters, config } from './config';
import { openDb } from './db';
import { runMonitor } from './monitor';
import { ExpoPushSender } from './push';
import { Repo } from './repo';
import { seedDemoHistory } from './seedDemo';
import { buildServer } from './server';

const db = openDb(config.databasePath);
const repo = new Repo(db, { proEmails: config.proEmails });
const adapters = buildAdapters(db);
const pruned = repo.pruneOffersExcept(config.stores);
if (pruned) console.log(`[lojas] ${pruned} ofertas de lojas desligadas foram tiradas do ar.`);
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
  // Sem token do Mercado Pago, Pix só em modo de teste (e só se ALLOW_DEV_PURCHASES=1).
  pix: config.mpAccessToken ? new MercadoPagoPix(config.mpAccessToken) : config.allowDevPurchases ? new DevPix() : undefined,
  publicUrl: config.publicUrl || undefined,
  webOrigins: config.webOrigins,
});
if (!config.resendApiKey) console.log('[auth] RESEND_API_KEY vazio: os códigos de login aparecem aqui no terminal.');
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`keropromo API em http://localhost:${config.port}`);
// Banco novo com a loja de exemplo ligada: gera histórico para o app não abrir vazio.
if (config.stores.includes('demo') && repo.productCount() === 0) {
  console.log('[seed] banco vazio: gerando 60 dias de histórico da loja de exemplo...');
  console.log(`[seed] pronto: ${await seedDemoHistory(repo)} ofertas ativas.`);
}
await tick();
setInterval(tick, config.monitorIntervalMin * 60_000);
