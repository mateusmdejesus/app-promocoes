import type { Category } from '@keropromo/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApi, type Api, type Me } from './api';
import { billing } from './billing';
import { storage } from './storage';

const TOKEN_KEY = 'keropromo.secret';
const ONBOARDED_KEY = 'keropromo.onboarded';

interface Session {
  ready: boolean;
  onboarded: boolean;
  /** Dados da conta (plano, e-mail...). null antes de existir conta. */
  me: Me | null;
  api: Api;
  /** Conta anônima do aparelho, usada durante o onboarding até a pessoa se identificar. */
  ensureAccount: () => Promise<void>;
  saveInterests: (categories: Category[]) => Promise<void>;
  /** Guarda o token devolvido pelo login (e-mail ou Apple) e recarrega a conta. */
  signedIn: (token: string) => Promise<Me>;
  refreshMe: () => Promise<Me | null>;
  finishOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const token = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const api = useMemo(() => createApi(() => token.current), []);

  const refreshMe = useCallback(async () => {
    if (!token.current) return null;
    const m = await api.me();
    setMe(m);
    return m;
  }, [api]);

  useEffect(() => {
    (async () => {
      token.current = await storage.get(TOKEN_KEY);
      const done = (await storage.get(ONBOARDED_KEY)) === '1' && !!token.current;
      if (done) {
        const m = await refreshMe().catch(() => null);
        if (m) await billing.identify(m.userId).catch(() => undefined);
      }
      setOnboarded(done);
      setReady(true);
    })();
  }, [api, refreshMe]);

  const setToken = async (t: string | null) => {
    token.current = t;
    if (t) await storage.set(TOKEN_KEY, t);
    else await storage.remove(TOKEN_KEY);
  };

  const ensureAccount = useCallback(async () => {
    if (token.current) return;
    const u = await api.register();
    await setToken(u.secret);
  }, [api]);

  const saveInterests = useCallback(
    async (categories: Category[]) => {
      await ensureAccount();
      await api.updateMe({ categories });
    },
    [api, ensureAccount],
  );

  const signedIn = useCallback(
    async (t: string) => {
      await setToken(t);
      const m = (await refreshMe())!;
      // As compras na loja ficam ligadas a este id: o webhook usa ele para liberar o Pro.
      // Falha da loja de assinaturas nunca pode impedir o login.
      await billing.identify(m.userId).catch(() => undefined);
      return m;
    },
    [refreshMe],
  );

  const finishOnboarding = useCallback(async () => {
    await storage.set(ONBOARDED_KEY, '1');
    setOnboarded(true);
  }, []);

  const reset = async () => {
    await setToken(null);
    await storage.remove(ONBOARDED_KEY);
    await billing.reset();
    setMe(null);
    setOnboarded(false);
  };

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    await reset();
  }, [api]);

  const deleteAccount = useCallback(async () => {
    await api.deleteMe();
    await reset();
  }, [api]);

  const value = useMemo(
    () => ({ ready, onboarded, me, api, ensureAccount, saveInterests, signedIn, refreshMe, finishOnboarding, signOut, deleteAccount }),
    [ready, onboarded, me, api, ensureAccount, saveInterests, signedIn, refreshMe, finishOnboarding, signOut, deleteAccount],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fora do SessionProvider');
  return s;
}
