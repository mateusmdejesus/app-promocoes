'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '../../components/Session';

export default function Conta() {
  const { me, ready, signOut } = useSession();
  const router = useRouter();
  if (!ready) return null;
  if (!me?.identified) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <p>
          Você não entrou. <Link href="/entrar">Entrar</Link>
        </p>
      </div>
    );
  }
  const pro = me.plan === 'pro';
  return (
    <div className="container" style={{ paddingTop: 48, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 className="h2">Minha conta</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>{me.email}</p>
      </div>
      <div className={pro ? 'dark' : 'card'} style={{ padding: 28, borderRadius: 18, background: pro ? 'var(--ink)' : undefined, color: pro ? '#d9d2c6' : undefined, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <strong className="h3" style={{ color: pro ? 'var(--paper)' : undefined }}>{pro ? 'keropromo Pro' : 'Plano grátis'}</strong>
        <span>
          {pro
            ? `Ativo até ${new Date(me.proUntil!).toLocaleDateString('pt-BR')}. Antes de vencer, mandamos o Pix do próximo período.`
            : 'Ofertas quentes aparecem para você 1 hora depois. Com o Pro, você vê na hora e recebe o aviso.'}
        </span>
        {/* Renovar só aparece quando falta pouco: antes disso, confunde quem já pagou. */}
        {pro && new Date(me.proUntil!).getTime() - Date.now() > 7 * 86_400_000 ? (
          <Link href="/ofertas" className="btn btn-light" style={{ alignSelf: 'flex-start', marginTop: 8 }}>
            Ver ofertas
          </Link>
        ) : (
          <Link href="/pro" className={`btn ${pro ? 'btn-light' : 'btn-signal'}`} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
            {pro ? 'Renovar agora' : 'Assinar o Pro'}
          </Link>
        )}
      </div>
      <button className="btn btn-soft" style={{ alignSelf: 'flex-start' }} onClick={async () => { await signOut(); router.push('/'); }}>
        Sair
      </button>
    </div>
  );
}
