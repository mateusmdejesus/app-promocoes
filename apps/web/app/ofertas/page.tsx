"use client";

import {
  CATEGORY_NAMES,
  HOME_TAB_CATEGORIES,
  type Category,
} from "@keropromo/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OfferCard, OfferRow, OfferTile } from "../../components/OfferCard";
import { useSession } from "../../components/Session";
import { api, type BrowseResult, type Offer } from "../../lib/api";
import { activeCount, FilterBar, type Filters } from "./Filters";
import s from "./ofertas.module.css";

/** Vitrine: as promoções do dia. Quem é grátis vê as quentes travadas e o Pro o tempo todo. */
export default function Ofertas() {
  const { me, ready } = useSession();
  const [hot, setHot] = useState<Offer[] | null>(null);
  const [all, setAll] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<Category | "all">("all");
  // Abas: "Todas" ou "Casa e eletro" (TV, eletrodomésticos e cozinha). /ofertas?aba=casa abre direto nela.
  const [tab, setTab] = useState<"all" | "casa" | null>(null);

  useEffect(() => {
    setTab(
      new URLSearchParams(location.search).get("aba") === "casa"
        ? "casa"
        : "all",
    );
  }, []);

  const chooseTab = (t: "all" | "casa") => {
    setTab(t);
    setCat("all");
    history.replaceState(
      null,
      "",
      t === "casa" ? "/ofertas?aba=casa" : "/ofertas",
    );
  };

  // Carrossel de quentes (igual para todos) e, para quem entrou, a lista com filtros.
  const [filters, setFilters] = useState<Filters>({ sort: "relevance" });
  const [facets, setFacets] = useState<BrowseResult["facets"] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!ready || tab === null) return;
    setError(null);
    setHot(null);
    const categories = tab === "casa" ? HOME_TAB_CATEGORIES : undefined;
    const hotQ = { limit: 40, categories };
    api
      .hot(undefined, hotQ)
      .then((h) => {
        setHot(h.offers);
        if (!me) setAll(h.offers);
      })
      .catch((e: Error) => setError(e.message));
  }, [ready, me, tab]);

  const PAGE = 60;
  const [loadingMore, setLoadingMore] = useState(false);
  const categoriesFor = () =>
    cat !== "all" ? [cat] : tab === "casa" ? [...HOME_TAB_CATEGORIES] : undefined;

  /** "Ver mais": busca a próxima página com os mesmos filtros e junta na lista. */
  const loadMore = () => {
    if (!all) return;
    setLoadingMore(true);
    api
      .browse({ ...filters, q: filters.q?.trim() || undefined, categories: categoriesFor(), limit: PAGE, offset: all.length })
      .then((r) => {
        setAll((cur) => {
          const seen = new Set((cur ?? []).map((o) => o.id));
          return [...(cur ?? []), ...r.offers.filter((o) => !seen.has(o.id))];
        });
        setTotal(r.total);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    if (!ready || tab === null || !me) return;
    const categories = categoriesFor();
    const t = setTimeout(() => {
      api
        .browse({ ...filters, q: filters.q?.trim() || undefined, categories, limit: PAGE })
        .then((r) => {
          setAll(r.offers);
          setFacets(r.facets);
          setTotal(r.total);
        })
        .catch((e: Error) => setError(e.message));
    }, filters.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [ready, me, tab, cat, filters]);

  const pro = me?.plan === "pro";
  const lockedCount = (hot ?? []).filter((o) => o.locked).length;
  const cats = useMemo(
    () => (facets ? facets.categories.map((c) => c.category) : [...new Set((all ?? []).map((o) => o.category))]),
    [all, facets],
  );
  // Sem busca nem filtro, as quentes ficam só no carrossel de cima; filtrando, aparecem na lista também.
  const filtering = !!filters.q?.trim() || activeCount(filters) > 0 || (filters.sort ?? "relevance") !== "relevance";
  const hotIds = new Set(filtering ? [] : (hot ?? []).map((o) => o.id));
  const list = (all ?? []).filter((o) => !hotIds.has(o.id));

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      {!pro && lockedCount > 0 ? (
        <Link href="/pro" className={`${s.banner} dark`}>
          <span>
            <strong>
              {lockedCount}{" "}
              {lockedCount === 1
                ? "oferta quente travada"
                : "ofertas quentes travadas"}{" "}
              agora.
            </strong>{" "}
            Quem é Pro já está vendo o preço e o link.
          </span>
          <span className="btn btn-signal" style={{ height: 44 }}>
            Ver agora com o Pro
          </span>
        </Link>
      ) : null}

      <div className={s.tabs} role="tablist" aria-label="Vitrine">
        <button
          role="tab"
          aria-selected={tab !== "casa"}
          className={s.tab}
          onClick={() => chooseTab("all")}
        >
          Todas
        </button>
        <button
          role="tab"
          aria-selected={tab === "casa"}
          className={s.tab}
          onClick={() => chooseTab("casa")}
        >
          Casa e eletro
        </button>
      </div>

      <section style={{ marginTop: 24 }}>
        <h1 className="h2">
          {tab === "casa" ? "Casa e eletro" : "Quentes agora"}
        </h1>
        <p className="muted" style={{ margin: "8px 0 20px" }}>
          {tab === "casa"
            ? "TV, geladeira, máquina de lavar, fogão e cozinha com 40% ou mais de desconto."
            : "40% ou mais de desconto, atualizadas a cada 5 minutos."}
        </p>
        {error ? (
          <p role="alert">
            Não deu para carregar as ofertas agora. {error}{" "}
            <button
              className="link"
              style={{
                background: "none",
                border: 0,
                padding: 0,
                textDecoration: "underline",
              }}
              onClick={() => location.reload()}
            >
              Tentar de novo
            </button>
          </p>
        ) : hot === null ? (
          <div className={s.grid}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`card ${s.skeleton}`} />
            ))}
          </div>
        ) : hot.length === 0 ? (
          <p className="muted">
            Nenhuma oferta quente neste momento. A gente segue vigiando.
          </p>
        ) : (
          <>
            <div className={`${s.rail} ${s.railWide} ${s.desktopOnly}`}>
              {hot.map((o) => (
                <OfferCard key={o.id} offer={o} />
              ))}
            </div>
            <div className={`${s.rail} ${s.mobileOnly}`}>
              {hot.map((o) => (
                <OfferTile key={o.id} offer={o} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Sem conta, a API só manda as quentes (já na faixa de cima): a lista só aparece para quem entrou. */}
      {me ? (
        <section style={{ marginTop: 56 }}>
          <div className={s.listHead}>
            <h2 className="h2" style={{ fontSize: 30 }}>
              {me ? "Pra você" : "Promoções"}
            </h2>
            <div
              className={s.chips}
              role="group"
              aria-label="Filtrar por categoria"
            >
              <button
                className="chip"
                aria-pressed={cat === "all"}
                onClick={() => setCat("all")}
              >
                Tudo
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  className="chip"
                  aria-pressed={cat === c}
                  onClick={() => setCat(c)}
                >
                  {CATEGORY_NAMES[c]}
                </button>
              ))}
            </div>
          </div>
          <FilterBar value={filters} onChange={setFilters} facets={facets} />
          {filtering && all ? (
            <p className="muted" style={{ margin: "0 0 12px" }}>
              {total} {total === 1 ? "promoção" : "promoções"}
            </p>
          ) : null}
          {all && list.length === 0 ? (
            <p className="muted">
              {filtering ? "Nada com esses filtros agora. Tente tirar algum." : "Nada com 25% ou mais nessa categoria agora."}
            </p>
          ) : null}
          <div className={`${s.rows} ${s.desktopOnly}`}>
            {list.map((o) => (
              <OfferRow key={o.id} offer={o} />
            ))}
          </div>
          <div className={`${s.tiles} ${s.mobileOnly}`}>
            {list.map((o) => (
              <OfferTile key={o.id} offer={o} />
            ))}
          </div>
          {all && all.length < total ? (
            <div className={s.more}>
              <button type="button" className="btn btn-soft btn-lg" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Carregando…" : `Ver mais promoções (${all.length} de ${total})`}
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="muted" style={{ marginTop: 32 }}>
          <Link href="/entrar" className="link" style={{ color: "var(--ink)" }}>
            Crie sua conta grátis
          </Link>{" "}
          para ver todas as promoções, ordenadas pelo que você curte.
        </p>
      )}
    </div>
  );
}
