'use client';

import Link from 'next/link';
import { useSession } from './Session';
import { Logo } from './Brand';
import styles from './Header.module.css';

/** Cabeçalho escuro, igual em todas as páginas. O botão da direita muda conforme a pessoa. */
export function Header() {
  const { me, ready } = useSession();
  const pro = me?.plan === 'pro';
  const signedIn = ready && !!me?.identified;
  return (
    <header className={`${styles.header} dark`}>
      <div className={`container ${styles.row}`}>
        {/* Quem entrou tem a vitrine como início; a landing é só para quem ainda não entrou. */}
        <Link href={signedIn ? '/ofertas' : '/'} aria-label="keropromo, início" className={styles.logo}>
          <Logo />
        </Link>
        <nav className={styles.nav} aria-label="Principal">
          <Link href="/ofertas">Ofertas</Link>
          {signedIn ? null : <Link href="/#como-funciona">Como funciona</Link>}
          {pro ? null : <Link href="/pro">Preços</Link>}
        </nav>
        <div className={styles.right}>
          {signedIn ? (
            <>
              {pro ? <span className={styles.proBadge}>PRO</span> : null}
              {/* No celular, "Minha conta" e "Seja Pro" ficam na barra de baixo (MobileNav). */}
              <Link href="/conta" className={`${styles.textLink} ${styles.desktopOnly}`}>
                Minha conta
              </Link>
            </>
          ) : (
            <Link href="/entrar" className={styles.textLink}>
              Entrar
            </Link>
          )}
          {!pro ? (
            <Link href="/pro" className={`btn btn-signal ${signedIn ? styles.desktopOnly : ''}`} style={{ height: 40, padding: '0 16px', borderRadius: 20, fontSize: 15 }}>
              Seja Pro
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
