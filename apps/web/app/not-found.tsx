import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container" style={{ paddingTop: 80, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      <h1 className="h2">Essa oferta não está mais aqui.</h1>
      <p className="muted" style={{ margin: 0 }}>Promoção boa some rápido. Veja as que estão valendo agora.</p>
      <Link href="/ofertas" className="btn btn-primary">Ver ofertas</Link>
    </div>
  );
}
