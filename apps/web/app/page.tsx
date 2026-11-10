import { PRICES } from '@keropromo/core';
import Link from 'next/link';
import { BigTag, CheckIcon } from '../components/Brand';
import { OfferCard } from '../components/OfferCard';
import { api, brl, type Offer } from '../lib/api';
import s from './landing.module.css';

// A página é gerada no servidor e atualizada a cada minuto: o contador é real.
export const revalidate = 60;

const PER_DAY = brl(Math.round(PRICES.monthly / 30));
const SAVING = Math.round((1 - PRICES.yearly / (PRICES.monthly * 12)) * 100);

const FAQ = [
  ['Como vocês sabem que o desconto é de verdade?', 'Guardamos o preço de cada produto a cada vez que olhamos a loja, o dia todo. Com esse histórico, dá para ver o preço que o produto costuma ter, e não só o "de" que a loja anuncia. Na página de cada oferta você vê o gráfico do preço.'],
  ['Quais lojas vocês acompanham?', 'Mercado Livre, Shopee e mais de 20 lojas parceiras, como Magazine Mateus, Friopeças, Candide e NutriBullet. Outras entram em breve.'],
  ['Como pago? Tem cobrança automática?', 'No Pix, sem cobrança automática: o mensal vale 30 dias e o anual 12 meses. Antes de vencer, mandamos o Pix do próximo período. Se não pagar, você volta para o plano grátis, sem multa.'],
  ['O que muda no plano grátis?', 'Você vê todas as promoções de 25% ou mais. As ofertas quentes (40% ou mais) aparecem para você 1 hora depois de surgirem, e o histórico de preço mostra 7 dias.'],
  ['Como recebo os avisos?', 'Salve o produto que você quer em Vigiando e crie uma meta, tipo "essa air fryer por até R$ 300". Quando o preço chegar lá, você recebe um e-mail. No grátis dá para ter 1 meta; no Pro, quantas quiser. O robô no Telegram chega em breve.'],
  ['Vocês ganham comissão das lojas?', 'Não. O keropromo é pago por quem assina. Por isso a gente só mostra o que é bom para você, não o que paga mais comissão.'],
];

export default async function Landing() {
  const hot: Offer[] = await api
    .hot(60)
    .then((r) => r.offers)
    .catch(() => []);
  const locked = hot.filter((o) => o.locked).length;

  return (
    <>
      {/* Quem já entrou vai direto para a vitrine, sem ver a landing (roda antes de desenhar a página). */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(localStorage.getItem('keropromo.token'))location.replace('/ofertas')}catch(e){}`,
        }}
      />
      <section className={`${s.hero} dark`}>
        <div className={`container ${s.heroGrid}`}>
          <div className={s.heroCopy}>
            <Link href="/#como-funciona" className={s.announce}>
              <span className={s.announceNew}>Novo</span> Mercado Livre, Shopee e mais de 20 lojas
              <span aria-hidden="true">→</span>
            </Link>
            <h1 className={`display ${s.title}`}>
              Promoção <span className={s.underline}>de verdade</span>, na hora que ela aparece.
            </h1>
            <p className={s.lead}>
              Vigiamos Mercado Livre, Shopee e mais de 20 lojas a cada 5 minutos e guardamos o histórico de cada preço, para você pegar a promoção <strong>de verdade</strong>, não o &quot;de&quot; que a loja inventa.
            </p>
            <div className={s.ctas}>
              <Link href="/pro" className="btn btn-signal btn-lg">
                Assinar o Pro por {brl(PRICES.monthly)}/mês
              </Link>
              <Link href="/ofertas" className={s.secondary}>
                Ver ofertas grátis
              </Link>
            </div>
            <p className={s.fine}>Pix, sem cobrança automática. Cancele quando quiser.</p>
          </div>

          <div className={s.receipt} aria-label="Exemplo: air fryer de 519 reais por 249 reais, menor preço que já vimos">
            <span className={s.product}>Air fryer 4L digital · Mercado Livre</span>
            <span className={s.old}>
              R$ 519
              <span className={s.strikeBar} />
            </span>
            <span className={`price ${s.new}`}>R$ 249</span>
            <span className={s.fact}>
              <span className={s.dot} />
              Menor preço que já vimos
            </span>
          </div>
        </div>
        <BigTag label="−52%" style={{ position: 'absolute', right: 'max(24px, calc(50% - 600px))', bottom: -52, transform: 'rotate(-7deg)', zIndex: 2 }} />

        <div className={`container ${s.liveWrap}`}>
          <div className={s.live} role="status">
            <span className={s.livePulse} aria-hidden="true" />
            {hot.length > 0 ? (
              <span>
                <strong>Agora: {hot.length} ofertas quentes.</strong> {locked > 0 ? `${locked} delas só quem é Pro está vendo neste momento.` : 'Atualizado a cada 5 minutos.'}
              </span>
            ) : (
              <span>
                <strong>Monitorando agora.</strong> Atualizado a cada 5 minutos.
              </span>
            )}
          </div>
        </div>
      </section>

      {hot.length > 0 ? (
        <section className="container" style={{ marginTop: 96 }}>
          <div className={s.sectionHead}>
            <div>
              <h2 className="h2">Quentes agora</h2>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                40% ou mais abaixo do preço normal. As travadas, o Pro já está vendo.
              </p>
            </div>
            <Link href="/ofertas" className="link">
              Ver todas as ofertas
            </Link>
          </div>
          <div className={s.grid4}>
            {hot.slice(0, 4).map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        </section>
      ) : null}

      <section id="como-funciona" className="container" style={{ marginTop: 120, scrollMarginTop: 96 }}>
        <h2 className="h2" style={{ maxWidth: 720 }}>
          Como a gente separa promoção de verdade de desconto de mentira
        </h2>
        <ol className={s.steps}>
          <li className="card">
            <span className={s.stepN}>1</span>
            <h3 className="h3">Vigiamos as lojas</h3>
            <p className="muted">Mercado Livre, Shopee e mais de 20 lojas, a cada 5 minutos, o dia todo. Cada preço fica guardado no histórico do produto.</p>
          </li>
          <li className="card">
            <span className={s.stepN}>2</span>
            <h3 className="h3">Conferimos o desconto</h3>
            <p className="muted">Com o histórico, dá para ver o preço que o produto costuma ter. A loja subiu o preço na véspera para &quot;dar 50%&quot;? O gráfico mostra.</p>
            <div className={s.example} aria-hidden="true">
              <span>
                Loja diz <span className="strike">R$ 200</span> → R$ 100 <span className={s.lie}>−50%</span>
              </span>
              <span>
                Preço normal R$ 120 → <strong>−16% de verdade</strong>
              </span>
            </div>
          </li>
          <li className="card">
            <span className={s.stepN}>3</span>
            <h3 className="h3">Você pega na hora</h3>
            <p className="muted">Quem é Pro vê as ofertas quentes assim que aparecem. E qualquer um pode vigiar um produto e receber um e-mail quando ele chegar no preço que quer.</p>
          </li>
        </ol>
      </section>

      <section className="container" style={{ marginTop: 120 }}>
        <div className={`${s.math} dark`}>
          <div>
            <span className={s.mathKicker}>A conta que fecha</span>
            <p className={`display ${s.mathBig}`}>{PER_DAY} por dia.</p>
          </div>
          <p className={s.mathText}>
            Uma air fryer com 52% de desconto economiza <strong>R$ 270</strong>. Isso paga <strong>um ano e meio</strong> de Pro. Uma única oferta pega na hora já vale a assinatura.
          </p>
        </div>
      </section>

      <section id="planos" className="container" style={{ marginTop: 120, scrollMarginTop: 96 }}>
        <h2 className="h2" style={{ textAlign: 'center' }}>
          Escolha como quer chegar
        </h2>
        <div className={s.plans}>
          <div className={`card ${s.plan}`}>
            <h3 className="h3">Grátis</h3>
            <p className={`price ${s.planPrice}`}>R$ 0</p>
            <ul className={s.features}>
              <li><CheckIcon /> <span>Promoções de 25% ou mais</span></li>
              <li><CheckIcon /> <span>Ofertas quentes 1 hora depois</span></li>
              <li><CheckIcon /> <span>Vigiar produtos e 1 meta de preço</span></li>
              <li><CheckIcon /> <span>Histórico de preço de 7 dias</span></li>
            </ul>
            <Link href="/ofertas" className="btn btn-soft btn-block">
              Começar grátis
            </Link>
          </div>
          <div className={`card ${s.plan} ${s.planPro} dark`}>
            <span className={s.recommended}>Recomendado</span>
            <h3 className="h3">Pro</h3>
            <p className={`price ${s.planPrice}`}>
              {brl(PRICES.monthly)}
              <span className={s.per}>/mês</span>
            </p>
            <p className={s.annual}>
              ou {brl(PRICES.yearly)} por ano · {SAVING}% mais barato
            </p>
            <ul className={s.features}>
              <li><CheckIcon /> <span>Ofertas quentes <strong>na hora</strong></span></li>
              <li><CheckIcon /> <span>Preço e link de todas as quentes</span></li>
              <li><CheckIcon /> <span>Metas de preço ilimitadas, com aviso por e-mail</span></li>
              <li><CheckIcon /> <span>Histórico de preço de até 90 dias</span></li>
              <li><CheckIcon /> <span>Em breve: robô no Telegram</span></li>
            </ul>
            <Link href="/pro" className="btn btn-signal btn-block btn-lg">
              Assinar o Pro
            </Link>
            <span className={s.planFine}>Pix · sem cobrança automática</span>
          </div>
        </div>
      </section>

      <section className="container" style={{ marginTop: 120, maxWidth: 800 }}>
        <h2 className="h2">Perguntas frequentes</h2>
        <div className={s.faq}>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p className="muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container" style={{ marginTop: 120 }}>
        <div className={`${s.final} dark`}>
          <h2 className="h2" style={{ color: 'var(--paper)' }}>
            A próxima oferta quente pode aparecer daqui a 5 minutos.
          </h2>
          <Link href="/pro" className="btn btn-signal btn-lg">
            Assinar o Pro por {brl(PRICES.monthly)}/mês
          </Link>
        </div>
      </section>
    </>
  );
}
