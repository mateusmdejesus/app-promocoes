'use client';

import { useRouter } from 'next/navigation';
import { LoginForm } from '../../components/LoginForm';

/** Tela de entrar dividida: formulário à esquerda, o porquê à direita. */
export default function Entrar() {
  const router = useRouter();
  return (
    <div className="container" style={{ paddingTop: 48 }}>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', overflow: 'hidden', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ padding: 'clamp(28px, 5vw, 56px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h1 className="h2" style={{ fontSize: 34 }}>
            Entrar ou criar conta
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Sem senha: mandamos um código para o seu e-mail.
          </p>
          <LoginForm onDone={() => router.push('/ofertas')} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Ao continuar, você concorda com os <a href="/termos">Termos de Uso</a> e a <a href="/privacidade">Política de Privacidade</a>.
          </p>
        </div>
        <div className="dark" style={{ background: 'var(--ink)', color: '#d9d2c6', padding: 'clamp(28px, 5vw, 56px)', display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
          <p className="display" style={{ color: 'var(--paper)', fontSize: 32 }}>
            Com a conta grátis você:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 17 }}>
            <li>vê promoções de 25% ou mais de Mercado Livre, Shopee e mais de 20 lojas;</li>
            <li>ordena tudo pelo que você curte;</li>
            <li>vigia os produtos que quer comprar e recebe um e-mail quando chegarem no seu preço.</li>
          </ul>
          <p style={{ margin: 0 }}>
            Quer as ofertas quentes na hora? Depois de entrar, é um clique para o <strong style={{ color: 'var(--paper)' }}>Pro</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
