'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, token, type Me } from '../lib/api';

interface Session {
  ready: boolean;
  me: Me | null;
  refresh: () => Promise<Me | null>;
  signIn: (t: string) => Promise<Me | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session>({ ready: false, me: null, refresh: async () => null, signIn: async () => null, signOut: async () => undefined });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    if (!token.get()) {
      setMe(null);
      return null;
    }
    try {
      const m = await api.me();
      // Grava de novo o login (e o cookie de "entrou") para quem entrou antes do cookie existir.
      if (m.identified) token.set(token.get()!);
      setMe(m);
      return m;
    } catch {
      // Sessão expirada ou apagada: volta a visitante.
      token.clear();
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = useCallback(
    async (t: string) => {
      token.set(t);
      return refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    token.clear();
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ ready, me, refresh, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
