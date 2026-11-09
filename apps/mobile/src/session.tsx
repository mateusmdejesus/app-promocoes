import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Category } from '@keropromo/core';
import { createApi, type Api } from './api';
import { storage } from './storage';

const SECRET_KEY = 'keropromo.secret';
const ONBOARDED_KEY = 'keropromo.onboarded';

interface Session {
  ready: boolean;
  onboarded: boolean;
  api: Api;
  /** Cria a conta anônima do aparelho, se ainda não existir. */
  ensureAccount: () => Promise<void>;
  /** Cria a conta (se preciso) e salva os interesses, sem concluir o onboarding. */
  saveInterests: (categories: Category[]) => Promise<void>;
  /** Conclui o onboarding salvando os interesses escolhidos. */
  finishOnboarding: (categories: Category[]) => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const secret = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const api = useMemo(() => createApi(() => secret.current), []);

  useEffect(() => {
    (async () => {
      secret.current = await storage.get(SECRET_KEY);
      setOnboarded((await storage.get(ONBOARDED_KEY)) === '1' && !!secret.current);
      setReady(true);
    })();
  }, []);

  const ensureAccount = useCallback(async () => {
    if (secret.current) return;
    const u = await api.register();
    await storage.set(SECRET_KEY, u.secret);
    secret.current = u.secret;
  }, [api]);

  const saveInterests = useCallback(
    async (categories: Category[]) => {
      await ensureAccount();
      await api.updateMe({ categories });
    },
    [api, ensureAccount],
  );

  const finishOnboarding = useCallback(
    async (categories: Category[]) => {
      await saveInterests(categories);
      await storage.set(ONBOARDED_KEY, '1');
      setOnboarded(true);
    },
    [saveInterests],
  );

  const value = useMemo(() => ({ ready, onboarded, api, ensureAccount, saveInterests, finishOnboarding }), [ready, onboarded, api, ensureAccount, saveInterests, finishOnboarding]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fora do SessionProvider');
  return s;
}
