import { randomUUID } from 'node:crypto';

/** Status de uma cobrança Pix, no vocabulário do Mercado Pago. */
export type PixStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export interface CreatedPix {
  providerId: string;
  /** Código "Pix copia e cola" (o QR code é gerado a partir dele). */
  qrCode: string;
}

export interface PixProvider {
  name: 'mercadopago' | 'dev';
  createPix(input: { amountCents: number; description: string; payerEmail: string; externalRef: string; expiresAt: Date; notificationUrl?: string }): Promise<CreatedPix>;
  getStatus(providerId: string): Promise<PixStatus>;
}

/**
 * Pix pelo Mercado Pago (API de pagamentos). Precisa de MP_ACCESS_TOKEN.
 * Ainda não testado contra a conta real: confirme com um Pix de R$ 1 antes de lançar.
 */
export class MercadoPagoPix implements PixProvider {
  name = 'mercadopago' as const;
  constructor(private accessToken: string, private fetchImpl: typeof fetch = fetch) {}

  async createPix(i: { amountCents: number; description: string; payerEmail: string; externalRef: string; expiresAt: Date; notificationUrl?: string }): Promise<CreatedPix> {
    const res = await this.fetchImpl('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': i.externalRef },
      body: JSON.stringify({
        transaction_amount: i.amountCents / 100,
        description: i.description,
        payment_method_id: 'pix',
        payer: { email: i.payerEmail },
        external_reference: i.externalRef,
        date_of_expiration: i.expiresAt.toISOString().replace('Z', '-00:00'),
        notification_url: i.notificationUrl,
      }),
    });
    const body = (await res.json()) as { id?: number; point_of_interaction?: { transaction_data?: { qr_code?: string } }; message?: string };
    const qr = body.point_of_interaction?.transaction_data?.qr_code;
    if (!res.ok || !body.id || !qr) throw new Error(`Mercado Pago recusou o Pix (${res.status}${body.message ? `: ${body.message}` : ''})`);
    return { providerId: String(body.id), qrCode: qr };
  }

  async getStatus(providerId: string): Promise<PixStatus> {
    const res = await this.fetchImpl(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(providerId)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error(`Mercado Pago respondeu ${res.status}`);
    const { status } = (await res.json()) as { status: string };
    if (status === 'approved') return 'approved';
    if (status === 'rejected') return 'rejected';
    if (status === 'cancelled') return 'cancelled';
    return 'pending';
  }
}

/** Modo de teste: gera um "Pix" falso; o pagamento é simulado por /v1/dev/pix/:id/pay. */
export class DevPix implements PixProvider {
  name = 'dev' as const;
  paid = new Set<string>();
  async createPix(i: { amountCents: number; externalRef: string }): Promise<CreatedPix> {
    const providerId = `dev-${randomUUID()}`;
    return { providerId, qrCode: `PIX-DE-TESTE|keropromo|${(i.amountCents / 100).toFixed(2)}|${i.externalRef}` };
  }
  async getStatus(providerId: string): Promise<PixStatus> {
    return this.paid.has(providerId) ? 'approved' : 'pending';
  }
}
