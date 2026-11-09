export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PushSender {
  /** Devolve, para cada mensagem, se o envio foi aceito. */
  send(messages: PushMessage[]): Promise<boolean[]>;
}

/**
 * Envio pelo serviço de push da Expo, que entrega no iOS (APNs) e no
 * Android (FCM) com o mesmo token. Docs: docs.expo.dev/push-notifications
 */
export class ExpoPushSender implements PushSender {
  constructor(private fetchImpl: typeof fetch = fetch) {}

  async send(messages: PushMessage[]): Promise<boolean[]> {
    const results: boolean[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      try {
        const res = await this.fetchImpl('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default', channelId: 'ofertas' }))),
        });
        const body = (await res.json()) as { data?: Array<{ status: string }> };
        results.push(...batch.map((_, j) => res.ok && body.data?.[j]?.status === 'ok'));
      } catch {
        results.push(...batch.map(() => false));
      }
    }
    return results;
  }
}

/** Não envia nada; usado em testes e no modo local. */
export class LogPushSender implements PushSender {
  sent: PushMessage[] = [];
  async send(messages: PushMessage[]): Promise<boolean[]> {
    this.sent.push(...messages);
    return messages.map(() => true);
  }
}
