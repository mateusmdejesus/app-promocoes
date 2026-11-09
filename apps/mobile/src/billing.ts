import type { BillingPeriod } from '@keropromo/core';
import { Platform } from 'react-native';
import Purchases, { PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';
import type { Api } from './api';

/**
 * Assinatura do Pro pela App Store / Google Play, via RevenueCat.
 * A loja cobra; o RevenueCat avisa o nosso servidor (webhook) e o servidor libera o Pro.
 *
 * Chaves: EXPO_PUBLIC_REVENUECAT_IOS_KEY e EXPO_PUBLIC_REVENUECAT_ANDROID_KEY.
 * Sem chave, e com EXPO_PUBLIC_DEV_PURCHASES=1, a compra é simulada pela API
 * (só funciona se a API tiver ALLOW_DEV_PURCHASES=1). Serve para testar antes das lojas.
 */
const STORE_KEY = Platform.select({ ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY, android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY });
/**
 * Test Store do RevenueCat: compra simulada, sem App Store/Google Play.
 * Só entra quando não há chave de loja real, para nunca ir parar numa versão publicada.
 */
const TEST_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
const KEY = STORE_KEY || TEST_KEY || undefined;
const DEV = process.env.EXPO_PUBLIC_DEV_PURCHASES === '1';

let configured = false;

export type PurchaseResult = 'purchased' | 'cancelled';

export const billing = {
  /** true quando dá para comprar (loja real ou modo de teste). */
  available: !!KEY || DEV,
  mode: STORE_KEY ? ('store' as const) : TEST_KEY ? ('test' as const) : DEV ? ('dev' as const) : ('off' as const),

  /** Liga as compras ao id da conta: é ele que chega no webhook. */
  async identify(userId: string) {
    if (!KEY) return;
    if (!configured) {
      Purchases.configure({ apiKey: KEY, appUserID: userId });
      configured = true;
    } else {
      await Purchases.logIn(userId);
    }
  },

  async reset() {
    if (configured) await Purchases.logOut().catch(() => undefined);
  },

  /** Preço como a loja mostra (já na moeda da pessoa), quando disponível. */
  async storePrices(): Promise<Partial<Record<BillingPeriod, string>>> {
    if (!configured) return {};
    const offering = (await Purchases.getOfferings()).current;
    return { yearly: offering?.annual?.product.priceString, monthly: offering?.monthly?.product.priceString };
  },

  async purchase(period: BillingPeriod, api: Api): Promise<PurchaseResult> {
    if (!KEY) {
      if (!DEV) throw new Error('As assinaturas ainda não estão configuradas nesta versão do app.');
      await api.devGrantPro(period);
      return 'purchased';
    }
    const offering = (await Purchases.getOfferings()).current;
    const pkg: PurchasesPackage | null | undefined = period === 'yearly' ? offering?.annual : offering?.monthly;
    if (!pkg) throw new Error('Plano indisponível na loja agora. Tente de novo em instantes.');
    try {
      await Purchases.purchasePackage(pkg);
      return 'purchased';
    } catch (e) {
      if ((e as { code?: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
      throw e;
    }
  },

  async restore(): Promise<void> {
    if (!configured) throw new Error('Nada para restaurar nesta versão do app.');
    await Purchases.restorePurchases();
  },
};
