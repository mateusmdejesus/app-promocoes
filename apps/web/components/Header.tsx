'use client';

import Link from 'next/link';
import { useSession } from './Session';
import { Logo } from './Brand';
import styles from './Header.module.css';

/** Cabeçalho escuro, igual em todas as páginas. O botão da direita muda conforme a pessoa. */
export function Header() {
  const { me, ready } = useSession();
  const pro = me?.plan === 'pro';
  return (
    <header className={`${styles.header} dark`}>
      <div className={`container ${styles.row}`}>
        <Link href="/" aria-label="keropromo, início" className={styles.logo}>
          <Logo />
        </Link>
        <nav className={styles.nav} aria-label="Principal">
          <Link href="/ofertas">Ofertas</Link>
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/pro">Preços</Link>
        </nav>
        <div className={styles.right}>
          {ready && me?.identified ? (
            <>
              {pro ? <span className={styles.proBadge}>PRO</span> : null}
              <Link href="/conta" className={styles.textLink}>
                Minha conta
              </Link>
            </>
          ) : (
            <Link href="/entrar" className={styles.textLink}>
              Entrar
            </Link>
          )}
          {!pro ? (
            <Link href="/pro" className="btn btn-signal" style={{ height: 40, padding: '0 16px', borderRadius: 20, fontSize: 15 }}>
              Seja Pro
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
