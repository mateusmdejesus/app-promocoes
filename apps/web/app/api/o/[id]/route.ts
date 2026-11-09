import { API_URL } from '../../../../lib/api';

/**
 * Busca a oferta pelo próprio site (mesmo endereço do navegador), repassando o login.
 * Assim bloqueadores de anúncio e regras de CORS não impedem o Pro de ver o preço e o link.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = req.headers.get('authorization');
  const res = await fetch(`${API_URL}/v1/offers/${encodeURIComponent(id)}`, {
    headers: auth ? { Authorization: auth } : {},
    cache: 'no-store',
  });
  return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
