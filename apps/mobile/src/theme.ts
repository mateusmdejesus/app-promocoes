/**
 * Identidade A · Etiqueta. Fonte da verdade: docs/design/IDENTIDADE.md
 */
export const color = {
  paper: '#F5F2EC',
  surface: '#FFFFFF',
  stone: '#E4DED3',
  line: '#D9D2C6',
  ink: '#16130F',
  inkMuted: '#6B645B',
  /** Desabilitado: legível, mas claramente inativo. */
  inkDisabled: '#8A8278',
  /** Somente oferta quente e símbolo da marca. */
  signal: '#FF5A1F',
} as const;

export const font = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

export const space = { s2: 2, s4: 4, s8: 8, s12: 12, s16: 16, s20: 20, s24: 24, s32: 32, s48: 48 } as const;
export const radius = { field: 12, card: 18, badge: 8, button: 16, pill: 999 } as const;

/** Margem lateral padrão das telas. */
export const gutter = 20;

export const type = {
  display: { fontFamily: font.display, fontSize: 34, lineHeight: 36, letterSpacing: -1 },
  title: { fontFamily: font.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  priceHero: { fontFamily: font.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  priceRow: { fontFamily: font.display, fontSize: 20, lineHeight: 24, letterSpacing: -0.3 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: font.medium, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: font.medium, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  button: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
} as const;
