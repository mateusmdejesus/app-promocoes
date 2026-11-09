# Identidade visual — keropromo

**Direção escolhida: A · Etiqueta** (aprovada em 09/11/2026).

A linguagem da etiqueta de preço de loja. O número é o herói; a cor de sinal
só aparece quando a oferta é quente. Calor do Headspace, disciplina do Uber Eats
(ver `REFERENCIAS.md`).

Quadro de exploração: https://claude.ai/artifact/PPm5qvqs1cc47DAqb6J2sF

## Logo

- Símbolo: etiqueta de preço (retângulo arredondado com ponta à esquerda e furo), em Sinal.
- Wordmark: `keropromo`, sempre minúsculo, Bricolage Grotesque 800, tracking −3%.
- Versões: sobre Papel (furo cor de Papel) e sobre Tinta (furo cor de Tinta).

```svg
<svg viewBox="0 0 64 64"><path d="M24 8H54a6 6 0 0 1 6 6V50a6 6 0 0 1-6 6H24L4 32Z" fill="#FF5A1F"/><circle cx="20" cy="32" r="5" fill="#F5F2EC"/></svg>
```

## Cores

| Token | Hex | Uso |
|---|---|---|
| `paper` | `#F5F2EC` | Fundo das telas |
| `surface` | `#FFFFFF` | Cards, barra de abas |
| `stone` | `#E4DED3` | Campos, botão secundário, fundo de foto |
| `line` | `#D9D2C6` | Bordas e divisórias |
| `ink` | `#16130F` | Texto principal e ação primária |
| `inkMuted` | `#6B645B` | Texto secundário (5,3:1 sobre Papel) |
| `signal` | `#FF5A1F` | **Somente** oferta quente e símbolo da marca |

Regras:
- Texto sobre `signal` é sempre `ink` (branco sobre laranja não passa contraste).
- `signal` nunca vira cor de botão, link ou ícone comum. Se tudo é laranja, nada é quente.
- Ação primária = `ink`.

## Tipografia

- **Bricolage Grotesque** (800/700): títulos, preços, selos, wordmark.
- **Inter** (400/500/600): todo o texto de interface.

| Estilo | Fonte | Tamanho/linha | Peso |
|---|---|---|---|
| display | Bricolage | 44/44 | 800 |
| price.hero | Bricolage | 28/32 | 800 |
| title | Bricolage | 22/28 | 800 |
| price.row | Bricolage | 20/24 | 800 |
| body | Inter | 16/24 | 400 |
| body.strong | Inter | 16/22 | 500 |
| caption | Inter | 13/18 | 400 |
| tab | Inter | 11/14 | 600 |

## Selos de desconto

| Faixa | Selo |
|---|---|
| ≥ 25% (promoção) | `−32%` — contorno 1,5 pt `ink`, texto `ink`, raio 8 |
| ≥ 40% (quente) | `−52% quente` — fundo `signal`, texto `ink`, raio 8 |
| < 25% | Não aparece no app |

Use o sinal de menos tipográfico (−), não hífen.

## Forma e espaço

- Escala de espaçamento base 4: 2, 4, 8, 12, 16, 20, 24, 32, 48.
- Margem lateral das telas: 20 pt.
- Raios: campos 12, cards 18, selos 8, chips e botões redondos pílula.
- Superfícies planas, sem sombra (exceto popovers/sheets).
- Ícones de traço 1,8 pt, cantos arredondados. Nada de emoji na interface.
