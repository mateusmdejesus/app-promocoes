'use client';

import { useState } from 'react';
import type { BrowseFilters, BrowseResult, BrowseSort } from '../../lib/api';
import s from './ofertas.module.css';

const SORTS: Array<[BrowseSort, string]> = [
  ['relevance', 'Pra você'],
  ['discount', 'Maior desconto'],
  ['price_asc', 'Menor preço'],
  ['price_desc', 'Maior preço'],
  ['newest', 'Mais novas'],
];
const DISCOUNTS = [0, 25, 40, 50, 60];

export type Filters = Pick<BrowseFilters, 'q' | 'stores' | 'minDiscount' | 'minPrice' | 'maxPrice' | 'sort'>;

export const activeCount = (f: Filters) => (f.stores?.length ?? 0) + (f.minDiscount ? 1 : 0) + (f.minPrice != null || f.maxPrice != null ? 1 : 0);

const toCents = (v: string) => {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return v.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

/** Busca, ordem e o painel de filtros (loja, desconto, preço). */
export function FilterBar({ value, onChange, facets }: { value: Filters; onChange: (f: Filters) => void; facets: BrowseResult['facets'] | null }) {
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(value.minPrice != null ? String(value.minPrice / 100) : '');
  const [max, setMax] = useState(value.maxPrice != null ? String(value.maxPrice / 100) : '');
  const n = activeCount(value);

  const toggleStore = (name: string) => {
    const cur = value.stores ?? [];
    onChange({ ...value, stores: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] });
  };

  return (
    <div className={s.filters}>
      <div className={s.filterRow}>
        <input
          className={s.searchInput}
          type="search"
          placeholder="Buscar nas promoções (ex.: air fryer, tênis, smart tv)"
          value={value.q ?? ''}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          aria-label="Buscar nas promoções"
        />
        <select className={s.select} value={value.sort ?? 'relevance'} onChange={(e) => onChange({ ...value, sort: e.target.value as BrowseSort })} aria-label="Ordenar">
          {SORTS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button type="button" className={`chip ${s.filterBtn}`} aria-expanded={open} aria-pressed={n > 0} onClick={() => setOpen((o) => !o)}>
          Filtros{n ? ` (${n})` : ''}
        </button>
      </div>

      {open ? (
        <div className={`card ${s.panel}`}>
          <div className={s.group}>
            <span className={s.groupLabel}>Desconto</span>
            <div className={s.chipRow}>
              {DISCOUNTS.map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={(value.minDiscount ?? 0) === d} onClick={() => onChange({ ...value, minDiscount: d || undefined })}>
                  {d ? `${d}% ou mais` : 'Qualquer'}
                </button>
              ))}
            </div>
          </div>

          <form
            className={s.group}
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ ...value, minPrice: toCents(min), maxPrice: toCents(max) });
            }}
          >
            <span className={s.groupLabel}>Preço</span>
            <div className={s.priceInputs}>
              <span>R$</span>
              <input inputMode="decimal" placeholder="de" value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Preço mínimo" />
              <span>até</span>
              <input inputMode="decimal" placeholder="até" value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Preço máximo" />
              <button type="submit" className="btn btn-soft">
                Aplicar
              </button>
            </div>
          </form>

          {facets && facets.stores.length > 1 ? (
            <div className={s.group}>
              <span className={s.groupLabel}>Loja</span>
              <div className={s.chipRow}>
                {facets.stores.map((st) => (
                  <button key={st.name} type="button" className="chip" aria-pressed={value.stores?.includes(st.name) ?? false} onClick={() => toggleStore(st.name)}>
                    {st.name} <span className="muted">{st.count}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {n ? (
            <button
              type="button"
              className={s.clear}
              onClick={() => {
                setMin('');
                setMax('');
                onChange({ q: value.q, sort: value.sort });
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
