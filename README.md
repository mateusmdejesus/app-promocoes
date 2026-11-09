# keropromo

App (Android e iOS) que vigia lojas online e avisa quando um produto entra em
promoção **de verdade**.

- **Promoção:** 25% ou mais de desconto real.
- **Oferta quente:** 40% ou mais.
- O desconto é calculado contra o preço que **nós observamos** nos últimos 90 dias,
  não contra o "de" que a loja anuncia. Isso pega a loja que sobe o preço antes de "dar desconto".

## Modelo de negócio

Assinatura, sem afiliado e sem período de teste:

| | Grátis | Pro (R$ 14,90/mês ou R$ 119/ano) |
|---|---|---|
| Promoções (25%+) | ✓ | ✓ |
| Ofertas quentes (40%+) | 1 hora depois (aparecem travadas, sem preço nem link) | Na hora |
| Aviso de oferta quente | — | Na hora |
| Alertas de produto | 1 (aviso de oferta quente sai com 1 h de atraso) | Ilimitados |
| Histórico de preço | 7 dias | 90 dias |

As regras ficam em `packages/core/src/plans.ts` e valem no servidor (o app não decide o que libera).

## Conta

E-mail com código de 6 dígitos (sem senha) e Entrar com Apple. O onboarding cria uma conta
anônima no aparelho; ao se identificar, ela vira a conta da pessoa (interesses mantidos).
O perfil tem Sair e Excluir conta (exigência da Apple).

## Estrutura

| Pasta | O que é |
|---|---|
| `packages/core` | Regras do produto em TypeScript puro: desconto real, faixas, ranking, personalização, alertas, limites de notificação. Usado pela API e pelo app. |
| `apps/api` | Servidor: coleta preços das lojas a cada 5 min, guarda o histórico, calcula ofertas, envia push e serve o app. |
| `apps/mobile` | App Expo (React Native) com Expo Router. Identidade visual em `docs/design/IDENTIDADE.md`. |
| `docs/design` | Identidade visual e referências. |

## Rodando localmente

Requer Node 22.5 ou mais novo.

```bash
npm install

# 1. API com dados de exemplo (gera 60 dias de histórico na hora)
npm run seed -w @keropromo/api
npm run api                      # http://localhost:3333

# 2. App
cd apps/mobile
EXPO_PUBLIC_API_URL=http://SEU_IP_NA_REDE:3333 npx expo start
```

O app usa módulos nativos (abas nativas, notificações, armazenamento seguro), então
roda num **development build**, não no Expo Go:
`npx expo run:ios` / `npx expo run:android`, ou `npx eas-cli build --profile development`.

`npx expo start --web` abre um preview no navegador, útil só para revisar o visual
(a barra de abas aparece no topo e notificações não funcionam no navegador).

Testes: `npm test` na raiz.

## Lojas

| Loja | Situação |
|---|---|
| Loja de exemplo (`demo`) | Funciona. Gera preços realistas, inclusive "de" inflado, para desenvolver sem depender de ninguém. |
| Mercado Livre | Coletor pela API oficial, com renovação automática do acesso. Precisa de `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REFRESH_TOKEN`. **Ainda não testado** com a API real. |
| Amazon | A fazer, via Keepa (serviço pago de histórico de preços da Amazon). |
| KaBuM! e outras | A fazer, via feed de produtos da Awin (o cadastro de parceiro é só a chave de acesso aos dados). |

Para conectar o Mercado Livre (uma vez só): no aplicativo de desenvolvedor, use o link de autorização para receber um código, e rode `npm run ml:connect -w @keropromo/api -- CODIGO`. Ele imprime o `ML_REFRESH_TOKEN`, que vai no Railway. O código vale uma vez e por pouco tempo.

Lojas ativas são escolhidas por `STORES` (veja `apps/api/.env.example`).

## Servidor publicado

Railway (projeto `kind-tenderness`, serviço `app-promocoes`, branch `claude/promo-monitoring-app-i9oen7`):
https://app-promocoes-production.up.railway.app — o app usa esse endereço por padrão.

- Volume montado em `/data` (banco SQLite).
- Variáveis: `STORES=demo`, `APPLE_BUNDLE_ID=app.keropromo` e **`PORT=3333`** (o Railway injeta a
  própria porta; sem fixar 3333 o domínio, que aponta para 3333, responde 502).
- Falta: `REVENUECAT_WEBHOOK_AUTH` (e o mesmo valor no webhook do RevenueCat) e `RESEND_API_KEY`.

## Testando o Pro sem loja

API com `ALLOW_DEV_PURCHASES=1` e app com `EXPO_PUBLIC_DEV_PURCHASES=1`: o botão "Assinar"
libera o Pro direto pela API. Sem `RESEND_API_KEY`, o código de login aparece no terminal da API.

## Para publicar

1. **Lojas de dados:** credenciais de cada fonte (API do Mercado Livre; Keepa para Amazon; feeds de
   produtos via Awin para KaBuM! e outras que oferecem catálogo para parceiros).
2. **Assinatura:** criar os produtos "mensal" e "anual" na App Store Connect e no Google Play,
   ligar no RevenueCat (ofertas com pacotes `monthly` e `annual`), configurar o webhook para
   `POST /v1/webhooks/revenuecat` com o segredo `REVENUECAT_WEBHOOK_AUTH`, e pôr as chaves públicas
   em `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
3. **Login:** `APPLE_BUNDLE_ID` na API e "Sign in with Apple" ligado no app id; conta no Resend
   (`RESEND_API_KEY`) com domínio verificado para enviar os códigos.
4. Criar o projeto no EAS (`npx eas-cli init`) para ter o `projectId`: sem ele o app não recebe push.
5. Hospedar a API (qualquer servidor Node 22) e, com mais usuários, trocar o SQLite por Postgres.
6. Publicar páginas de Termos e Privacidade (o app aponta para keropromo.app/termos e /privacidade).
7. Contas de desenvolvedor Apple (US$ 99/ano) e Google Play (US$ 25 uma vez).
