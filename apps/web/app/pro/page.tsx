'use client';

import { PRICES } from '@keropromo/core';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { CheckIcon } from '../../components/Brand';
import { LoginForm } from '../../components/LoginForm';
import { useSession } from '../../components/Session';
import { api, brl, type PixCharge } from '../../lib/api';
import s from './pro.module.css';

type Period = 'monthly' | 'yearly';
const SAVING = Math.round((1 - PRICES.yearly / (PRICES.monthly * 12)) * 100);

const ROWS: Array<[string, string, string]> = [
  ['Ofertas quentes (40%+)', '1 h depois', 'Na hora'],
  ['Preço e link das quentes', '1 h depois', 'Sempre'],
  ['Histórico de preço', '7 dias', 'Até 90 dias'],
  ['Avisos por e-mail e Telegram', '—', 'Em breve'],
];

/** Compra do Pro em três etapas (Conta → Pagamento → Pronto), com Pix. */
export default function Pro() {
  const { me, ready, refresh } = useSession();
  const [period, setPeriod] = useState<Period>('yearly');
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(0);

  const identified = !!me?.identified;
  const step = done ? 3 : identified ? 2 : 1;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { charge: c } = await api.createPix(period);
      setCharge(c);
      setQr(await QRCode.toDataURL(c.qrCode, { margin: 1, width: 360, color: { dark: '#16130F', light: '#FFFFFF' } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Consulta o pagamento a cada 3 s enquanto o Pix está aberto.
  const poll = useCallback(async () => {
    if (!charge) return;
    const r = await api.pix(charge.id).catch(() => null);
    if (!r) return;
    setCharge(r.charge);
    if (r.charge.status === 'approved') {
      await refresh();
      setDone(true);
    }
  }, [charge, refresh]);

  useEffect(() => {
    if (!charge || charge.status !== 'pending' || done) return;
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [charge, poll, done]);

  useEffect(() => {
    if (!charge) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(charge.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [charge]);

  const copy = async () => {
    if (!charge) return;
    await navigator.clipboard.writeText(charge.qrCode).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const expired = !!charge && (charge.status === 'expired' || (charge.status === 'pending' && left === 0));
  const price = PRICES[period];

  return (
    <div className="container" style={{ paddingTop: 48 }}>
      <div className={s.layout}>
        <section className={s.pitch}>
          <span className={s.kicker}>keropromo Pro</span>
          <h1 className={`display ${s.title}`}>Chegue antes de a oferta acabar.</h1>
          <p className="muted" style={{ fontSize: 18, margin: 0 }}>
            Uma air fryer com 52% de desconto economiza R$ 270. Isso paga um ano e meio de Pro.
          </p>
          <div className={`card ${s.table}`}>
            <div className={s.tr} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)' }}>
              <span />
              <span>Grátis</span>
              <span style={{ color: 'var(--ink)' }}>Pro</span>
            </div>
            {ROWS.map(([label, free, pro]) => (
              <div key={label} className={s.tr}>
                <span style={{ fontWeight: 500 }}>{label}</span>
                <span className="muted">{free}</span>
                <strong>{pro}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className={`card ${s.checkout}`} aria-label="Assinatura">
          <ol className={s.stepper} aria-label="Etapas">
            {['Conta', 'Pagamento', 'Pronto'].map((label, i) => (
              <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={step > i ? s.stepOn : undefined}>
                <span className={s.bar} />
                {label}
              </li>
            ))}
          </ol>

          {done ? (
            <div className={s.success}>
              <span className={s.successIcon}>
                <CheckIcon size={28} />
              </span>
              <h2 className="h2" style={{ fontSize: 34 }}>
                Pronto! Você é Pro.
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {me?.proUntil ? `Seu acesso vai até ${new Date(me.proUntil).toLocaleDateString('pt-BR')}. ` : ''}Antes de vencer, a gente te manda o Pix do próximo período.
              </p>
              <Link href="/ofertas" className="btn btn-signal btn-lg btn-block">
                Ver as ofertas quentes agora
              </Link>
            </div>
          ) : (
            <>
              <div className={s.plans} role="radiogroup" aria-label="Plano">
                {(['yearly', 'monthly'] as const).map((p) => (
                  <button
                    key={p}
                    role="radio"
                    aria-checked={period === p}
                    className={s.plan}
                    onClick={() => {
                      setPeriod(p);
                      setCharge(null);
                      setQr(null);
                    }}
                    disabled={busy}
                  >
                    <span className={s.radio} aria-hidden="true" />
                    <span className={s.planText}>
                      <strong>{p === 'yearly' ? 'Anual' : 'Mensal'}</strong>
                      <span className="muted">{p === 'yearly' ? `${brl(Math.round(PRICES.yearly / 12))} por mês · ${SAVING}% mais barato` : 'Pague mês a mês'}</span>
                    </span>
                    <span className="price" style={{ fontSize: 22 }}>
                      {brl(PRICES[p])}
                    </span>
                  </button>
                ))}
              </div>

              {!ready ? null : !identified ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 18 }}>Primeiro, sua conta</h2>
                  <LoginForm cta="Continuar" />
                </div>
              ) : me?.plan === 'pro' && !charge ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: 0 }}>
                    Você já é Pro até <strong>{new Date(me.proUntil!).toLocaleDateString('pt-BR')}</strong>. Pagando agora, o novo período começa depois dessa data.
                  </p>
                  <button className="btn btn-primary btn-lg" onClick={generate} disabled={busy}>
                    {busy ? 'Gerando Pix…' : `Renovar com Pix de ${brl(price)}`}
                  </button>
                </div>
              ) : !charge || expired ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {expired ? <p className="error">Esse Pix expirou. Gere outro, leva um segundo.</p> : null}
                  <button className="btn btn-signal btn-lg" onClick={generate} disabled={busy}>
                    {busy ? 'Gerando Pix…' : `Pagar ${brl(price)} com Pix`}
                  </button>
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                    {period === 'monthly'
                      ? 'Vale 30 dias. Sem cobrança automática: três dias antes de vencer, mandamos o Pix do próximo mês.'
                      : 'Vale 12 meses. Avisamos antes de vencer. Sem cobrança automática.'}
                  </p>
                </div>
              ) : (
                <div className={s.pix} aria-live="polite">
                  <div className={s.status}>
                    <span className={s.pulse} aria-hidden="true" />
                    Aguardando pagamento · expira em {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                  </div>
                  <div className={s.pixGrid}>
                    {qr ? <img src={qr} alt="QR code do Pix" className={s.qr} /> : null}
                    <ol className={s.howto}>
                      <li>
                        Toque em <strong>Copiar código Pix</strong>
                      </li>
                      <li>
                        No app do banco, escolha <strong>Pix copia e cola</strong>
                      </li>
                      <li>O Pro libera sozinho aqui, em segundos</li>
                    </ol>
                  </div>
                  <button className="btn btn-primary btn-lg" onClick={copy}>
                    {copied ? 'Código copiado ✓' : 'Copiar código Pix'}
                  </button>
                  {charge.test ? (
                    <button
                      className="btn btn-soft"
                      onClick={async () => {
                        await api.devPayPix(charge.id).catch((e: Error) => setError(e.message));
                        await poll();
                      }}
                    >
                      Simular pagamento (modo de teste)
                    </button>
                  ) : null}
                </div>
              )}
              {error ? (
                <p className="error" role="alert" style={{ margin: 0 }}>
                  {error}
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
