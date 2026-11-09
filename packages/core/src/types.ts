/** Lojas monitoradas. `demo` gera dados de exemplo para desenvolvimento. */
/** `lomadee` é uma rede de afiliados com várias lojas: a loja de cada produto vai em `Product.seller`. */
export type StoreId = 'mercadolivre' | 'amazon' | 'magalu' | 'aliexpress' | 'kabum' | 'lomadee' | 'demo';

export const STORE_NAMES: Record<StoreId, string> = {
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  magalu: 'Magalu',
  aliexpress: 'AliExpress',
  kabum: 'KaBuM!',
  lomadee: 'Loja parceira',
  demo: 'Loja de exemplo',
};

export const CATEGORIES = [
  'eletronicos',
  'eletro',
  'casa',
  'moda',
  'beleza',
  'games',
  'mercado',
  'esporte',
  'bebe',
  'pet',
  'livros',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_NAMES: Record<Category, string> = {
  eletronicos: 'Eletrônicos',
  eletro: 'Eletro e TV',
  casa: 'Casa e cozinha',
  moda: 'Moda',
  beleza: 'Beleza',
  games: 'Games',
  mercado: 'Mercado',
  esporte: 'Esporte',
  bebe: 'Bebê',
  pet: 'Pet',
  livros: 'Livros',
};

/** Aba "Casa e eletro" da vitrine: TV, eletrodomésticos e cozinha (pensada para um público mais velho). */
export const HOME_TAB_CATEGORIES: readonly Category[] = ['eletro', 'casa'];

/** Valores monetários sempre em centavos (inteiros), nunca float. */
export type Cents = number;

/** Um registro de preço observado numa loja. */
export interface PricePoint {
  price: Cents;
  /** Preço "de" anunciado pela loja, quando existe. Não é confiável sozinho. */
  listPrice?: Cents;
  at: Date;
}

export type Tier = 'hot' | 'promo' | 'none';

export interface Product {
  id: string;
  store: StoreId;
  externalId: string;
  title: string;
  category: Category;
  url: string;
  imageUrl?: string;
  /** Loja que vende de fato, quando a fonte junta várias (ex.: "Shopee" via Lomadee). */
  seller?: string;
}

/** Nome da loja para mostrar: a loja real quando a fonte junta várias. */
export const storeLabel = (p: Pick<Product, 'store' | 'seller'>): string => p.seller || STORE_NAMES[p.store];

/** Resultado da análise de preço de um produto num momento. */
export interface PriceAnalysis {
  price: Cents;
  /** Preço de referência usado para calcular o desconto real. */
  referencePrice: Cents;
  /** Desconto real em pontos percentuais inteiros (0-100). */
  discountPct: number;
  tier: Tier;
  /** true quando a referência vem do nosso histórico (e não só do "de" da loja). */
  verified: boolean;
  /** A loja anunciou um "de" inflado (bem acima do preço normal observado). */
  inflatedListPrice: boolean;
  /** Menor preço observado na janela de histórico. */
  lowestInWindow: boolean;
  /** Dias de histórico disponíveis. */
  historyDays: number;
}
