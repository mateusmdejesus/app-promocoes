'use client';

import { usePathname } from 'next/navigation';

/** O Estúdio tem layout próprio: esconde cabeçalho, rodapé e barra do celular do site. */
export function HideOnStudio({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return path?.startsWith('/estudio') ? null : <>{children}</>;
}
