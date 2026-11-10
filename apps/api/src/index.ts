import { AppleJwtVerifier, LogEmailSender, ResendEmailSender } from './auth';
import { DevPix, MercadoPagoPix } from './billing';
import { buildAdapters, config, describeSecret } from './config';
import { openDb } from './db';
import { runMonitor } from './monitor';
import { ExpoPushSender } from './push';
import { notifyWatches } from './watches';
import { InstagramClient } from './instagram';
import { Repo } from './repo';
import { seedDemoHistory } from './seedDemo';
import { buildServer } from './server';

const db = openDb(config.databasePath);
const repo = new Repo(db, { proEmails: config.proEmails });
const adapters = buildAdapters(db);
const pruned = repo.pruneOffersExcept(config.stores);
if (pruned) console.log(`[lojas] ${pruned} ofertas de lojas desligadas foram tiradas do ar.`);
const sender = new ExpoPushSender();
const email = config.resendApiKey ? new ResendEmailSender(config.resendApiKey, config.emailFrom) : new LogEmailSender();

let running = false;
async function tick() {
  if (running) return; // uma varredura lenta não pode se sobrepor à próxima
  running = true;
  try {
    const r = await runMonitor(repo, adapters, sender);
    const metas = await notifyWatches(repo, email, config.siteUrl, new Date());
    console.log(`[monitor] ${r.scanned} produtos, ${r.newDeals} ofertas novas, ${r.pushesSent} notificações, ${metas} avisos de meta${r.errors.length ? `, erros: ${r.errors.join('; ')}` : ''}`);
  } catch (e) {
    console.error('[monitor] falhou:', e);
  } finally {
    running = false;
  }
}

// Instagram do Estúdio: o token de Página (que não vence) fica guardado no banco.
const IG_KEY = 'ig_page_token';
const instagram =
  config.igAccessToken && config.igUserId
    ? new InstagramClient(config.igAccessToken, config.igUserId, fetch, 5 * 60_000, {
        get: () => (db.prepare('SELECT v FROM kv WHERE k = ?').get(IG_KEY) as { v: string } | undefined)?.v,
        set: (t) => void db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(IG_KEY, t),
      })
    : undefined;
if (instagram) instagram.init().then((how) => console.log(`[instagram] usando ${how}`));

const app = buildServer(repo, {
  email,
  apple: config.appleBundleId ? new AppleJwtVerifier(config.appleBundleId) : undefined,
  revenuecatAuth: config.revenuecatWebhookAuth || undefined,
  allowDevPurchases: config.allowDevPurchases,
  // Sem token do Mercado Pago, Pix só em modo de teste (e só se ALLOW_DEV_PURCHASES=1).
  pix: config.mpAccessToken ? new MercadoPagoPix(config.mpAccessToken) : config.allowDevPurchases ? new DevPix() : undefined,
  publicUrl: config.publicUrl || undefined,
  webOrigins: config.webOrigins,
  adminEmails: config.adminEmails,
  adminApiKey: config.adminApiKey || undefined,
  siteUrl: config.siteUrl,
  instagram,
});
console.log(`[instagram] ${config.igAccessToken && config.igUserId ? `conectado (conta ${config.igUserId})` : 'desligado (falta IG_ACCESS_TOKEN ou IG_USER_ID)'}`);
console.log(`[pix] ${config.mpAccessToken ? `Mercado Pago, chave ${describeSecret(config.mpAccessToken)}` : config.allowDevPurchases ? 'modo de teste' : 'desligado (sem MP_ACCESS_TOKEN)'}`);
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
