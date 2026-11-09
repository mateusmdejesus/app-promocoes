/**
 * Preenche o banco com 60 dias de histórico da loja de exemplo, para o app
 * já abrir com ofertas "verificadas" em vez de esperar semanas de coleta.
 * Uso: npm run seed -w @keropromo/api
 */
import { DemoAdapter } from './adapters/demo';
import { config } from './config';
import { openDb } from './db';
import { runMonitor } from './monitor';
import { LogPushSender } from './push';
import { Repo } from './repo';

const repo = new Repo(openDb(config.databasePath));
const adapters = [new DemoAdapter()];
const now = Date.now();
const STEP = 6 * 3_600_000;

for (let t = now - 60 * 86_400_000; t <= now; t += STEP) {
  await runMonitor(repo, adapters, new LogPushSender(), new Date(t), { notify: false });
}
const r = await runMonitor(repo, adapters, new LogPushSender(), new Date(now), { notify: false });
console.log(`Histórico de 60 dias gerado. ${r.scanned} produtos, ${repo.activeOffers().length} em promoção agora.`);
