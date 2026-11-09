import { router } from 'expo-router';
import type { Session } from './api';
import type { useSession } from './session';

/**
 * Depois do login (e-mail ou Apple):
 * - quem já tinha conta configurada vai direto para o app;
 * - quem está criando a conta segue para os planos e depois as notificações.
 */
export async function afterSignIn(s: Session, session: ReturnType<typeof useSession>, mode: 'signup' | 'login') {
  const me = await session.signedIn(s.token);
  if (!s.isNew && me.categories.length > 0 && mode === 'login') {
    await session.finishOnboarding(); // o guard do layout troca para as abas
    return;
  }
  if (me.categories.length === 0) {
    router.replace('/interests');
    return;
  }
  router.push({ pathname: '/plans', params: { from: 'onboarding' } });
}
