import { DemoAdapter } from './adapters/demo';
import { MercadoLivreAdapter } from './adapters/mercadolivre';
import type { StoreAdapter } from './adapters/types';

export const config = {
  port: Number(process.env.PORT ?? 3333),
  databasePath: process.env.DATABASE_PATH ?? new URL('../keropromo.db', import.meta.url).pathname,
  monitorIntervalMin: Number(process.env.MONITOR_INTERVAL_MIN ?? 5),
  stores: (process.env.STORES ?? 'demo').split(',').map((s) => s.trim()).filter(Boolean),
  mlAccessToken: process.env.ML_ACCESS_TOKEN ?? '',
};

export function buildAdapters(): StoreAdapter[] {
  const out: StoreAdapter[] = [];
  for (const s of config.stores) {
    if (s === 'demo') out.push(new DemoAdapter());
    else if (s === 'mercadolivre') {
      if (!config.mlAccessToken) throw new Error('STORES inclui mercadolivre, mas ML_ACCESS_TOKEN está vazio.');
      out.push(new MercadoLivreAdapter({ accessToken: config.mlAccessToken }));
    } else throw new Error(`Loja desconhecida em STORES: ${s}`);
  }
  return out;
}
