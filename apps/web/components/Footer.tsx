import Link from 'next/link';

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--line)', marginTop: 96 }}>
      <div className="container" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center', padding: '32px var(--gutter)', fontSize: 14, color: 'var(--ink-muted)' }}>
        <span className="display" style={{ fontSize: 16, color: 'var(--ink)' }}>
          keropromo
        </span>
        <span>Preços mudam a todo momento; confira na loja antes de comprar.</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
          <Link href="/#como-funciona" style={{ color: 'inherit' }}>
            Como calculamos
          </Link>
          <Link href="/termos" style={{ color: 'inherit' }}>
            Termos
          </Link>
          <Link href="/privacidade" style={{ color: 'inherit' }}>
            Privacidade
          </Link>
        </span>
      </div>
    </footer>
  );
}
