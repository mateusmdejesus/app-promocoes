# keropromo

App (Android e iOS) que vigia lojas online e avisa quando um produto entra em
promoção **de verdade**.

- **Promoção:** 25% ou mais de desconto real.
- **Oferta quente:** 40% ou mais.
- O desconto é calculado contra o preço que **nós observamos** nos últimos 90 dias,
  não contra o "de" que a loja anuncia. Isso pega a loja que sobe o preço antes de "dar desconto".

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
| Mercado Livre | Coletor escrito sobre a API oficial; **ainda não testado** com um token real. Precisa de `ML_ACCESS_TOKEN`. |
| Amazon, Magalu, AliExpress, KaBuM! | A fazer. Cada uma precisa de cadastro no programa de afiliados para liberar a API. |

Lojas ativas são escolhidas por `STORES` (veja `apps/api/.env.example`).

## Para publicar

1. Cadastrar nos programas de afiliados e obter as credenciais das APIs.
2. Criar o projeto no EAS (`npx eas-cli init`) para ter o `projectId`: sem ele o app não recebe push.
3. Hospedar a API (qualquer servidor Node 22) e, com mais usuários, trocar o SQLite por Postgres.
4. Contas de desenvolvedor Apple (US$ 99/ano) e Google Play (US$ 25 uma vez).
