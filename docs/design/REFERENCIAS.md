# Referências de design

Telas de referência enviadas pelo dono do produto. Ficam em `referencias/`:

- `referencias/uber-eats/` — 17 telas do onboarding do Uber Eats (iOS).
- `referencias/headspace/` — 21 telas do onboarding do Headspace (iOS).

Regra geral: **nada de "AI slop"**. Sem degradê roxo, sem card genérico com sombra,
sem emoji decorativo, sem animação gratuita. O app tem que parecer feito por um time
de produto de verdade.

## O que tirar do Uber Eats: disciplina

Da especificação de engenharia reversa do onboarding (393 x 852 pt, iPhone 15 Pro):

**Layout**
- Margem lateral de 16 pt, coluna única, muito espaço em branco (60-70% nas telas de formulário).
- Título começa ~26 pt abaixo da status bar. Conteúdo na metade de cima, rodapé fixo embaixo.
- Escala de espaçamento base 4: 2, 4, 8, 12, 16, 20, 24, 32, 48, 52. Nada fora disso.
- Ritmo: título→subtítulo 12, subtítulo→label 24, label→campo 8, campo→próximo label 16.

**Componentes**
- Controles com 48 pt de altura, raio 8. Campos com fundo cinza `#F2F1F4`; ao focar, fundo some e entra borda preta de 2 pt (sem glow).
- Label sempre acima do campo. Nada de label flutuante ou placeholder no lugar do label.
- Rodapé de fluxo: botão voltar circular 52 pt à esquerda, pílula "Próximo →" 52 pt à direita, 16 pt de margem, sobe junto com o teclado.
- "Próximo" desabilitado (cinza) até a etapa estar válida.
- Um único botão primário por tela. Ação primária em preto. Ações terciárias são links de texto.
- Superfícies planas. Sombra só em popover (`0 8 24 rgba(0,0,0,0.12)`).
- Código OTP: um campo oculto com `oneTimeCode`, desenhado como células.

**Texto**
- Direto, curto, segunda pessoa, frases em caixa de sentença (não Title Case).
- Perguntas para dados pessoais ("Como você se chama?") e subtítulo explicando o porquê.

**Correções que a própria análise aponta (aplicar no nosso app)**
- Uma única família tipográfica e uma escala de títulos consistente.
- Uma única cor de marca, com variante derivada para ação.
- Indicador de progresso nas etapas do onboarding (o Uber Eats não tem).
- Alvos de toque de no mínimo 44 pt. Contraste ≥ 4.5:1; links sublinhados.
- Estados que faltam no Uber Eats e precisamos desenhar: erro de campo, erro de rede com "Tentar de novo", carregando no botão, skeleton de lista, estado vazio.
- Login com Apple pelo botão oficial (exigência da App Store quando há login social).
- Respeitar "Reduzir movimento" e tamanhos de fonte dinâmicos.

## O que tirar do Headspace: personalidade

- Ilustração própria e uma cor de marca forte e quente, usada com confiança em áreas grandes.
- Formas orgânicas (curva grande separando ilustração e conteúdo).
- **Quiz no onboarding** ("O que você quer?") com opções em linhas de seleção, uma tela por pergunta,
  barra de progresso fina no topo e uma tela de "pensando…" antes do resultado personalizado.
  Para nós: as categorias e faixas de preço escolhidas aqui alimentam a personalização das ofertas.
- Pedido de permissão de notificação com contexto antes do pop-up do sistema
  ("Ative para saber quando uma oferta quente aparecer" + "Agora não").

## Síntese para o nosso app

Estrutura e rigor do Uber Eats + calor e identidade do Headspace.
Base neutra e muito branco; uma cor de marca própria usada com intenção
(principalmente para sinalizar desconto e ofertas quentes); ação primária escura.
