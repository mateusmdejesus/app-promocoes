import type { Category } from '@keropromo/core';
import type { ListingSnapshot, StoreAdapter } from './types';

/**
 * Loja de exemplo para desenvolver e testar sem depender de nenhuma API real.
 * Os preços variam de forma determinística com o tempo: de vez em quando um
 * produto entra em promoção, e alguns anunciam um "de" inflado de propósito,
 * para exercitar a detecção de desconto falso.
 */
interface DemoItem {
  id: string;
  title: string;
  category: Category;
  base: number; // centavos
  /** Anuncia um "de" 60% acima do preço normal o tempo todo. */
  liar?: boolean;
}

const CATALOG: DemoItem[] = [
  { id: 'd01', title: 'Air fryer 4L digital, 1500W, 8 programas', category: 'casa', base: 51900 },
  { id: 'd02', title: 'Fone bluetooth over-ear com cancelamento de ruído', category: 'eletronicos', base: 28900 },
  { id: 'd03', title: 'Smart TV 50" 4K com Wi-Fi', category: 'eletronicos', base: 249900 },
  { id: 'd04', title: 'Tênis de corrida amortecido masculino', category: 'esporte', base: 39900, liar: true },
  { id: 'd05', title: 'Cafeteira expresso 15 bar', category: 'casa', base: 69900 },
  { id: 'd06', title: 'Controle sem fio para console', category: 'games', base: 44900 },
  { id: 'd07', title: 'Kit skincare vitamina C 3 itens', category: 'beleza', base: 15900 },
  { id: 'd08', title: 'Mochila executiva impermeável para notebook', category: 'moda', base: 18900, liar: true },
  { id: 'd09', title: 'Ração premium para cães adultos 15kg', category: 'pet', base: 22900 },
  { id: 'd10', title: 'Fralda descartável tamanho G, 96 unidades', category: 'bebe', base: 12900 },
  { id: 'd11', title: 'Box livros de ficção científica, 3 volumes', category: 'livros', base: 11900 },
  { id: 'd12', title: 'Café torrado em grãos 1kg', category: 'mercado', base: 7990 },
  { id: 'd13', title: 'Aspirador robô com mapeamento', category: 'casa', base: 159900 },
  { id: 'd14', title: 'Smartwatch com GPS e monitor cardíaco', category: 'eletronicos', base: 89900 },
  { id: 'd15', title: 'Jogo de panelas antiaderente 5 peças', category: 'casa', base: 34900, liar: true },
  { id: 'd16', title: 'Headset gamer com microfone', category: 'games', base: 25900 },
  { id: 'd17', title: 'Perfume masculino 100ml', category: 'beleza', base: 32900 },
  { id: 'd18', title: 'Bicicleta ergométrica magnética', category: 'esporte', base: 119900 },
  { id: 'd19', title: 'Jaqueta corta-vento unissex', category: 'moda', base: 21900 },
  { id: 'd20', title: 'Teclado mecânico sem fio', category: 'eletronicos', base: 37900 },
];

/** Hash inteiro simples e estável (FNV-1a). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SLOT_MS = 6 * 3_600_000;

export function demoPrice(item: DemoItem, now: Date): { price: number; listPrice?: number } {
  const day = Math.floor(now.getTime() / 86_400_000);
  const slot = Math.floor(now.getTime() / SLOT_MS);
  // Oscilação diária de até ±4%.
  const noise = ((hash(`${item.id}:${day}`) % 81) - 40) / 1000;
  let price = Math.round(item.base * (1 + noise));
  // Em média 1 a cada 4 janelas de 6 h o produto entra em promoção (25% a 60%).
  if (hash(`${item.id}:deal:${slot}`) % 4 === 0) {
    const pct = 25 + (hash(`${item.id}:pct:${slot}`) % 36);
    price = Math.round(item.base * (1 - pct / 100));
  }
  price = Math.round(price / 10) * 10 - 10; // termina em ,90
  const listPrice = item.liar ? Math.round(item.base * 1.6) : undefined;
  return { price, listPrice };
}

export class DemoAdapter implements StoreAdapter {
  store = 'demo' as const;
  async fetchListings(now: Date): Promise<ListingSnapshot[]> {
    return CATALOG.map((item) => ({
      externalId: item.id,
      title: item.title,
      category: item.category,
      url: `https://example.com/produto/${item.id}`,
      ...demoPrice(item, now),
    }));
  }
}
