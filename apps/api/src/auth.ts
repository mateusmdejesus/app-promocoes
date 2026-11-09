import { createRemoteJWKSet, jwtVerify } from 'jose';

// ---------- e-mail com código ----------

export interface EmailSender {
  sendCode(to: string, code: string): Promise<void>;
}

/** Desenvolvimento: imprime o código no terminal da API em vez de enviar. */
export class LogEmailSender implements EmailSender {
  last = new Map<string, string>();
  async sendCode(to: string, code: string) {
    this.last.set(to, code);
    console.log(`[auth] código para ${to}: ${code}`);
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
