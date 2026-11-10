import { NextResponse, type NextRequest } from 'next/server';

// Mesmo nome de SIGNED_IN_COOKIE em lib/api.ts (o middleware roda no Edge: sem importar o resto).
const SIGNED_IN_COOKIE = 'kp_in';
/** Endereço antigo da Vercel: tudo vai para o domínio próprio. */
const OLD_HOST = 'app-promocoes.vercel.app';
const SITE = 'https://keropromo.com.br';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  if (host === OLD_HOST) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, SITE);
    return NextResponse.redirect(url, 308);
  }
  // Quem já entrou nunca vê a landing: a home é a vitrine.
  if (req.nextUrl.pathname === '/' && req.cookies.get(SIGNED_IN_COOKIE)?.value === '1') {
    return NextResponse.redirect(new URL('/ofertas', req.url), 307);
  }
  return NextResponse.next();
}

// Tudo, menos arquivos estáticos do Next e imagens.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)'] };
