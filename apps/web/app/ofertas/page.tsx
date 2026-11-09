"use client";

import { CATEGORY_NAMES, type Category } from "@keropromo/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OfferCard, OfferRow, OfferTile } from "../../components/OfferCard";
import { useSession } from "../../components/Session";
import { api, type Offer } from "../../lib/api";
import s from "./ofertas.module.css";

/** Vitrine: as promoções do dia. Quem é grátis vê as quentes travadas e o Pro o tempo todo. */
export default function Ofertas() {
  const { me, ready } = useSession();
  const [hot, setHot] = useState<Offer[] | null>(null);
  const [all, setAll] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<Category | "all">("all");

  useEffect(() => {
    if (!ready) return;
    setError(null);
    Promise.all([api.hot(), me ? api.feed() : api.hot()])
      .then(([h, f]) => {
        setHot(h.offers);
        setAll(f.offers);
      })
      .catch((e: Error) => setError(e.message));
  }, [ready, me]);

  const pro = me?.plan === "pro";
  const lockedCount = (hot ?? []).filter((o) => o.locked).length;
  const cats = useMemo(
    () => [...new Set((all ?? []).map((o) => o.category))],
    [all],
  );
  // As quentes ficam no carrossel de cima (deslizando para o lado, no celular e no computador).
  const hotIds = new Set((hot ?? []).map((o) => o.id));
  const list = (all ?? []).filter(
    (o) => !hotIds.has(o.id) && (cat === "all" || o.category === cat),
  );

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

      <section style={{ marginTop: 32 }}>
        <h1 className="h2">Quentes agora</h1>
        <p className="muted" style={{ margin: "8px 0 20px" }}>
          40% ou mais abaixo do preço normal dos últimos 90 dias.
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
          {all && list.length === 0 ? (
            <p className="muted">Nada com 25% ou mais nessa categoria agora.</p>
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
        </section>
      ) : (
        <p className="muted" style={{ marginTop: 32 }}>
          <Link href="/entrar" className="link" style={{ color: "var(--ink)" }}>
            Crie sua conta grátis
          </Link>{" "}
          para ver todas as promoções, ordenadas pelo que você curte, e criar um
          alerta.
        </p>
      )}
    </div>
  );
}
