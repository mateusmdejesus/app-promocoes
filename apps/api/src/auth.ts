import { createRemoteJWKSet, jwtVerify } from 'jose';

// ---------- e-mail com código ----------

/** Aviso de que um produto vigiado chegou na meta de preço. Preços em centavos. */
export interface PriceAlertMail {
  title: string;
  price: number;
  target: number;
  storeName: string;
  /** Página do produto no keropromo. */
  pageUrl: string;
}

export interface EmailSender {
  sendCode(to: string, code: string): Promise<void>;
  sendPriceAlert(to: string, a: PriceAlertMail): Promise<void>;
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function priceAlertText(a: PriceAlertMail): { subject: string; text: string } {
  return {
    subject: `Chegou na sua meta: ${a.title.slice(0, 60)} por ${brl(a.price)}`,
    text:
      `O produto que você está vigiando chegou no preço que você queria.\n\n` +
      `${a.title}\n` +
      `Agora: ${brl(a.price)} no ${a.storeName}\n` +
      `Sua meta: ${brl(a.target)}\n\n` +
      `Ver o produto e o histórico de preço: ${a.pageUrl}\n\n` +
      `Preço pode mudar a qualquer momento; confira na loja antes de comprar.\n` +
      `Para parar de receber, remova a meta em Vigiando, no keropromo.`,
  };
}

/** Desenvolvimento: imprime o código no terminal da API em vez de enviar. */
export class LogEmailSender implements EmailSender {
  last = new Map<string, string>();
  async sendCode(to: string, code: string) {
    this.last.set(to, code);
    console.log(`[auth] código para ${to}: ${code}`);
  }
  alerts: Array<{ to: string } & PriceAlertMail> = [];
  async sendPriceAlert(to: string, a: PriceAlertMail) {
    this.alerts.push({ to, ...a });
    console.log(`[meta] aviso para ${to}: ${priceAlertText(a).subject}`);
  }
}

/**
 * Envio real pelo Resend (resend.com). Precisa de RESEND_API_KEY e de um
 * domínio verificado para o remetente. Ainda não testado com uma chave real.
 */
export class ResendEmailSender implements EmailSender {
  constructor(private apiKey: string, private from: string, private fetchImpl: typeof fetch = fetch) {}
  async sendCode(to: string, code: string) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: `${code} é seu código do keropromo`,
        text: `Seu código de acesso ao keropromo é ${code}.\n\nEle vale por 10 minutos. Se não foi você, ignore este e-mail.`,
      }),
    });
    if (!res.ok) throw new Error(`Falha ao enviar e-mail (${res.status})`);
  }
  async sendPriceAlert(to: string, a: PriceAlertMail) {
    const { subject, text } = priceAlertText(a);
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to, subject, text }),
    });
    if (!res.ok) throw new Error(`Falha ao enviar aviso de meta (${res.status})`);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------- Entrar com Apple ----------

export interface AppleIdentity {
  sub: string;
  email?: string;
}

export interface AppleVerifier {
  verify(identityToken: string): Promise<AppleIdentity>;
}

/**
 * Confere o identityToken que o app recebe do "Entrar com Apple":
 * assinatura com as chaves públicas da Apple, emissor e destinatário (o bundle id do app).
 */
export class AppleJwtVerifier implements AppleVerifier {
  private jwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  constructor(private bundleId: string) {}
  async verify(identityToken: string): Promise<AppleIdentity> {
    const { payload } = await jwtVerify(identityToken, this.jwks, { issuer: 'https://appleid.apple.com', audience: this.bundleId });
    if (typeof payload.sub !== 'string') throw new Error('token sem sub');
    return { sub: payload.sub, email: typeof payload.email === 'string' ? normalizeEmail(payload.email) : undefined };
  }
}
