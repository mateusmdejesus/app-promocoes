'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from './Session';

const RESEND_S = 30;

/** Entrar ou criar conta: e-mail → código de 6 dígitos. É o mesmo fluxo para os dois casos. */
export function LoginForm({ onDone, cta = 'Receber código' }: { onDone?: () => void; cta?: string }) {
  const { signIn } = useSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.startEmail(email.trim());
      setStep('code');
      setWait(RESEND_S);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.verifyEmail(email.trim(), value);
      await signIn(s.token);
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  if (step === 'email') {
    return (
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="nome@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="email-error"
            autoFocus
            required
          />
          <span id="email-error" className="error" role="alert">
            {error}
          </span>
        </div>
        <button className="btn btn-primary btn-lg" disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())}>
          {busy ? 'Enviando…' : cta}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      noValidate
    >
      <p style={{ margin: 0 }}>
        Enviamos um código de 6 dígitos para <strong>{email.trim()}</strong>.{' '}
        <button type="button" className="link" style={{ background: 'none', border: 0, padding: 0, textDecoration: 'underline' }} onClick={() => setStep('email')}>
          Trocar e-mail
        </button>
      </p>
      <div className="field">
        <label htmlFor="code">Código</label>
        <input
          id="code"
          ref={codeRef}
          className="input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            setError(null);
            if (v.length === 6) verify(v);
          }}
          aria-invalid={!!error}
          aria-describedby="code-error"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '0.3em' }}
        />
        <span id="code-error" className="error" role="alert">
          {error}
        </span>
      </div>
      <button className="btn btn-primary btn-lg" disabled={busy || code.length !== 6}>
        {busy ? 'Conferindo…' : 'Entrar'}
      </button>
      <button type="button" className="btn btn-soft" disabled={wait > 0 || busy} onClick={() => send()}>
        {wait > 0 ? `Reenviar código (0:${String(wait).padStart(2, '0')})` : 'Reenviar código'}
      </button>
    </form>
  );
}
