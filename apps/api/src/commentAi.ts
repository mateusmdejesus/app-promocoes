/**
 * Classificação dos comentários do Instagram e respostas sugeridas.
 *
 * Sem ANTHROPIC_API_KEY: regras por palavras (grátis, boas o bastante para separar o óbvio)
 * e respostas prontas por tipo. Com a chave: o Claude classifica em lote e escreve
 * 3 respostas no tom do keropromo, só quando você abre o comentário (para gastar pouco).
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { CommentLabel, CommentPriority } from './repo';

export interface Classified {
  label: CommentLabel;
  priority: CommentPriority;
}

export interface CommentInput {
  id: string;
  username: string;
  text: string;
}

const PRIORITY: Record<CommentLabel, CommentPriority> = {
  reclamacao: 'alta',
  lead: 'alta',
  pergunta: 'media',
  elogio: 'baixa',
  spam: 'baixa',
  outro: 'baixa',
};

export const priorityFor = (label: CommentLabel): CommentPriority => PRIORITY[label];

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

/** Regras simples, em português do dia a dia. A ordem importa: spam e reclamação primeiro. */
export function classifyByRules(text: string): Classified {
  const t = norm(text);
  const label: CommentLabel = (() => {
    if (/https?:\/\/|www\.|\.com\b/.test(t) || has(t, ['segue la', 'sigam', 'follow', 'ganhe dinheiro', 'renda extra', 'chama no direct', 'olha meu perfil', 'visite meu perfil', 'promo no perfil']))
      return 'spam';
    if (has(t, ['golpe', 'mentira', 'enganac', 'nao funciona', 'nao chegou', 'pessim', 'horrivel', 'lixo', 'fake', 'propaganda enganosa', 'roubada', 'nao confio', 'decepc', 'furada', 'pior ']))
      return 'reclamacao';
    if (has(t, ['quero o link', 'quero saber', 'quero assinar', 'quero usar', 'quero testar', 'quero comprar', 'manda o link', 'me manda', 'me passa', 'cade o link', 'qual o site', 'qual site', 'como assina', 'como assino', 'como faco pra', 'como faz pra', 'onde compr', 'quanto custa', 'qual o valor', 'qual valor', 'link?', 'link pfv', 'link por favor']))
      return 'lead';
    if (t.includes('?') || /^(como|qual|quais|onde|quando|quanto|por que|porque|funciona|da pra|tem )/.test(t.trim())) return 'pergunta';
    if (has(t, ['top', 'amei', 'incrivel', 'massa', 'brabo', 'perfeito', 'bom demais', 'show', 'muito bom', 'sensacional', 'genio', 'parabens', 'adorei', 'excelente']) || /[❤🔥👏😍🙌💯👍]/u.test(text))
      return 'elogio';
    return 'outro';
  })();
  return { label, priority: PRIORITY[label] };
}

/** Respostas prontas quando não há IA. Curtas e no tom de conversa. */
export function templateReplies(c: { username: string; label: CommentLabel }): string[] {
  const at = `@${c.username}`;
  switch (c.label) {
    case 'reclamacao':
      return [
        `${at} poxa, me conta o que aconteceu que eu resolvo contigo. Te chamei no direct!`,
        `${at} entendo total. O keropromo só mostra preço que caiu de verdade, com o histórico do lado. Me fala qual produto que eu olho aqui.`,
        `${at} valeu por falar. Me chama no direct que eu quero entender e arrumar.`,
      ];
    case 'lead':
      return [
        `${at} tá no link da bio: keropromo.com.br. Entra, escolhe o que você quer vigiar e pronto!`,
        `${at} é só entrar em keropromo.com.br. Dá pra usar de graça e ver as promoções reais do dia.`,
        `${at} te mandei no direct! Qualquer coisa me chama.`,
      ];
    case 'pergunta':
      return [
        `${at} boa pergunta! O keropromo olha o preço todo dia e só avisa quando cai de verdade, comparando com os últimos 90 dias.`,
        `${at} funciona assim: você marca o produto, coloca o preço que quer pagar e a gente te avisa quando chegar.`,
        `${at} te respondi no direct com calma!`,
      ];
    case 'elogio':
      return [`${at} valeu demais! 🧡`, `${at} tamo junto! Chega a Black Friday que vai ter muito achado bom.`, `${at} que bom que curtiu! Salva aí pra não perder.`];
    case 'spam':
      return [];
    default:
      return [`${at} valeu por comentar!`, `${at} tamo junto 🧡`, `${at} qualquer dúvida me chama no direct!`];
  }
}

const ABOUT = `O keropromo (keropromo.com.br) é um site que vigia preços no Mercado Livre e em mais de 20 lojas (Shopee, Centauro e outras) e mostra só as promoções reais, comparando com o histórico de 90 dias. Dá para marcar um produto, definir um preço-meta e receber e-mail quando chegar. Tem plano grátis e o Pro (R$ 14,90/mês ou R$ 119/ano, Pix, sem cobrança automática). Quem responde é o Mateus, criador do site, no Instagram @mateusmjesus.`;

const CLASSIFY_SYSTEM = `${ABOUT}

Você classifica comentários dos posts do Instagram do Mateus. Para cada comentário, escolha:
- label: "reclamacao" (crítica, desconfiança, problema), "pergunta" (dúvida sobre como funciona), "lead" (quer o link, quer assinar, quer comprar), "elogio", "spam" (propaganda de terceiros, links, robôs) ou "outro".
- priority: "alta" para reclamações e leads, "media" para perguntas, "baixa" para o resto, a não ser que o texto peça outra coisa.`;

const REPLY_SYSTEM = `${ABOUT}

Escreva 3 respostas diferentes para um comentário do Instagram, como o Mateus responderia: conversa de bar, frases curtas, português do dia a dia, nada técnico, sem parecer atendimento de empresa. Comece cada resposta com o @ da pessoa. No máximo 220 caracteres cada. Não invente preços, prazos ou promoções que não estejam no texto. Para reclamações, reconheça e chame para o direct. Para quem quer o link, diga que está na bio (keropromo.com.br).`;

const ClassifySchema = z.object({
  items: z.array(z.object({ id: z.string(), label: z.enum(['reclamacao', 'pergunta', 'lead', 'elogio', 'spam', 'outro']), priority: z.enum(['alta', 'media', 'baixa']) })),
});
const RepliesSchema = z.object({ replies: z.array(z.string()) });

export class CommentAi {
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  /** Classifica vários comentários num pedido só. Os que faltarem na resposta ficam com as regras. */
  async classify(comments: CommentInput[]): Promise<Map<string, Classified>> {
    const out = new Map<string, Classified>();
    if (!comments.length) return out;
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(ClassifySchema) },
      system: CLASSIFY_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(comments.map((c) => ({ id: c.id, autor: c.username, texto: c.text }))) }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return out;
    for (const it of res.parsed_output.items) out.set(it.id, { label: it.label, priority: it.priority });
    return out;
  }

  /** 3 respostas para um comentário, levando em conta a legenda do post e o que já foi respondido. */
  async suggest(c: CommentInput & { label: CommentLabel; caption: string; replies: string[] }): Promise<string[]> {
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(RepliesSchema) },
      system: REPLY_SYSTEM,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ legenda_do_post: c.caption.slice(0, 600), autor: `@${c.username}`, tipo: c.label, comentario: c.text, respostas_ja_dadas: c.replies }),
        },
      ],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return [];
    return res.parsed_output.replies.map((r) => r.trim()).filter(Boolean).slice(0, 3);
  }
}
