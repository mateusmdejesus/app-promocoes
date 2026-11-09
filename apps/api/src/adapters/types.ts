import type { Category, Cents, StoreId } from '@keropromo/core';

/** O que um coletor de loja devolve a cada varredura. */
export interface ListingSnapshot {
  externalId: string;
  title: string;
  category: Category;
  price: Cents;
  /** Preço "de" anunciado, se a loja informar. */
  listPrice?: Cents;
  /** Link para a loja (de afiliado, quando configurado). */
  url: string;
  imageUrl?: string;
  /** Loja que vende de fato, quando a fonte junta várias (Lomadee). */
  seller?: string;
}

export interface StoreAdapter {
  store: StoreId;
  fetchListings(now: Date): Promise<ListingSnapshot[]>;
}
