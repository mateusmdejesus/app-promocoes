'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from './Session';
import s from './MobileNav.module.css';

/** Barra de baixo no celular, para quem entrou: sempre dá para voltar à vitrine ou à conta. */
export function MobileNav() {
  const { me, ready } = useSession();
  const path = usePathname();
  if (!ready || !me?.identified) return null;
  const pro = me.plan === 'pro';
  const items = [
    { href: '/ofertas', label: 'Ofertas', active: path === '/ofertas' || path.startsWith('/oferta/'), icon: <path d="M3 7l2-4h14l2 4M3 7v13h18V7M3 7h18M9 11a3 3 0 006 0" /> },
    { href: '/vigiando', label: 'Vigiando', active: path === '/vigiando', icon: <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z" /> },
    ...(pro ? [] : [{ href: '/pro', label: 'Seja Pro', active: path === '/pro', icon: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" /> }]),
    { href: '/conta', label: 'Minha conta', active: path === '/conta', icon: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" /> },
  ];
  return (
    <>
      <div className={s.spacer} aria-hidden />
      <nav className={`${s.bar} dark`} aria-label="Navegação">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={s.item} aria-current={i.active ? 'page' : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {i.icon}
            </svg>
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
