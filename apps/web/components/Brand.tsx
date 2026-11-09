/** Símbolo da etiqueta. O furo assume a cor do fundo. */
export function TagMark({ size = 26, hole = 'var(--ink)' }: { size?: number; hole?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M24 8H54a6 6 0 0 1 6 6V50a6 6 0 0 1-6 6H24L4 32Z" fill="var(--signal)" />
      <circle cx="20" cy="32" r="5" fill={hole} />
    </svg>
  );
}

export function Logo({ dark = true, size = 22 }: { dark?: boolean; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <TagMark size={size + 4} hole={dark ? 'var(--ink)' : 'var(--paper)'} />
      <span className="display" style={{ fontSize: size, letterSpacing: '-0.03em', color: dark ? 'var(--paper)' : 'var(--ink)' }}>
        keropromo
      </span>
    </span>
  );
}

/** Etiqueta grande com o desconto escrito, usada nas ilustrações. */
export function BigTag({ label, width = 260, height = 132, style }: { label: string; width?: number; height?: number; style?: React.CSSProperties }) {
  const tip = height * 0.36;
  return (
    <div className="tag-shape" aria-hidden="true" style={{ width, height, paddingLeft: tip + height * 0.2, ...style }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path d={`M${tip} 0H${width - 14}a14 14 0 0 1 14 14V${height - 14}a14 14 0 0 1-14 14H${tip}L0 ${height / 2}Z`} fill="var(--signal)" />
        <circle cx={tip - 6} cy={height / 2} r={height * 0.075} fill="var(--ink)" />
      </svg>
      <span style={{ fontSize: height * 0.46 }}>{label}</span>
    </div>
  );
}

export function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      <path d="M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
