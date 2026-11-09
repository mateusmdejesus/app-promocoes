import { DemoAdapter } from './adapters/demo';
import { runMonitor } from './monitor';
import { LogPushSender } from './push';
import type { Repo } from './repo';

/**
 * Gera `days` dias de histórico da loja de exemplo, para o app já abrir com
 * ofertas "verificadas" em vez de esperar semanas de coleta.
 */
export async function seedDemoHistory(repo: Repo, days = 60, now = Date.now()): Promise<number> {
  const adapters = [new DemoAdapter()];
  const step = 6 * 3_600_000;
  for (let t = now - days * 86_400_000; t <= now; t += step) {
    await runMonitor(repo, adapters, new LogPushSender(), new Date(t), { notify: false });
  }
  return repo.activeOffers().length;
}
