import { NextResponse, type NextRequest } from 'next/server';

// Mesmo nome de SIGNED_IN_COOKIE em lib/api.ts (o middleware roda no Edge: sem importar o resto).
const SIGNED_IN_COOKIE = 'kp_in';

/** Quem já entrou nunca vê a landing: a home é a vitrine. */
export function middleware(req: NextRequest) {
  if (req.cookies.get(SIGNED_IN_COOKIE)?.value === '1') {
    return NextResponse.redirect(new URL('/ofertas', req.url), 307);
  }
  return NextResponse.next();
}

export const config = { matcher: '/' };
