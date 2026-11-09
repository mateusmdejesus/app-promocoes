import { DemoAdapter } from './adapters/demo';
import { LomadeeAdapter } from './adapters/lomadee';
import { MercadoLivreAdapter } from './adapters/mercadolivre';
import type { DB } from './db';
import { MercadoLivreAuth } from './mercadolivreAuth';
import type { StoreAdapter } from './adapters/types';

export const config = {
  port: Number(process.env.PORT ?? 3333),
  databasePath: process.env.DATABASE_PATH ?? new URL('../keropromo.db', import.meta.url).pathname,
  monitorIntervalMin: Number(process.env.MONITOR_INTERVAL_MIN ?? 5),
  stores: (process.env.STORES ?? 'demo').split(',').map((s) => s.trim()).filter(Boolean),
  mlClientId: process.env.ML_CLIENT_ID ?? '',
  mlClientSecret: process.env.ML_CLIENT_SECRET ?? '',
  mlRefreshToken: process.env.ML_REFRESH_TOKEN ?? '',
  lomadeeApiKey: process.env.LOMADEE_API_KEY ?? '',
  appleBundleId: process.env.APPLE_BUNDLE_ID ?? '',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'keropromo <acesso@keropromo.com.br>',
  revenuecatWebhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH ?? '',
  allowDevPurchases: process.env.ALLOW_DEV_PURCHASES === '1',
  mpAccessToken: process.env.MP_ACCESS_TOKEN ?? '',
  publicUrl: process.env.PUBLIC_URL ?? '',
  proEmails: (process.env.PRO_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  webOrigins: (process.env.WEB_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
};

export function buildAdapters(db: DB): StoreAdapter[] {
  const out: StoreAdapter[] = [];
  for (const s of config.stores) {
    if (s === 'demo') out.push(new DemoAdapter());
    else if (s === 'mercadolivre') {
      if (!config.mlClientId || !config.mlClientSecret) throw new Error('STORES inclui mercadolivre, mas ML_CLIENT_ID ou ML_CLIENT_SECRET estão vazios.');
      const auth = new MercadoLivreAuth({ clientId: config.mlClientId, clientSecret: config.mlClientSecret, db, bootstrapRefreshToken: config.mlRefreshToken || undefined });
      out.push(new MercadoLivreAdapter({ auth }));
    } else if (s === 'lomadee') {
      if (!config.lomadeeApiKey) throw new Error('STORES inclui lomadee, mas LOMADEE_API_KEY está vazio.');
      out.push(new LomadeeAdapter({ apiKey: config.lomadeeApiKey }));
    } else throw new Error(`Loja desconhecida em STORES: ${s}`);
  }
  return out;
}
