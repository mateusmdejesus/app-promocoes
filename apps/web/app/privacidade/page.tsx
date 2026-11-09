import Link from 'next/link';
import { CONTACT_EMAIL, H, LegalPage } from '../../components/Legal';

export const metadata = { title: 'Política de Privacidade' };

export default function Page() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        Esta política explica quais dados o keropromo (site keropromo.com.br e app keropromo) coleta, para que usa e quais são os seus direitos, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <H>1. Dados que coletamos</H>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li><strong>Conta:</strong> seu e-mail e, se usar &quot;Entrar com Apple&quot;, o identificador que a Apple nos envia.</li>
        <li><strong>Preferências e uso:</strong> as categorias que você escolhe, as ofertas que você abre, salva ou clica para ir à loja, e as buscas que faz no keropromo.</li>
        <li><strong>Assinatura:</strong> o plano, as datas e o status das cobranças Pix. Os dados de pagamento ficam com o Mercado Pago; não recebemos dados bancários.</li>
        <li><strong>Técnicos:</strong> registros de acesso (como endereço IP e horário), guardados pelos serviços de hospedagem por segurança.</li>
        <li><strong>App:</strong> o código do aparelho para notificações, se você permitir.</li>
      </ul>
      <p>Não pedimos nome, CPF, endereço nem dados de cartão.</p>

      <H>2. Para que usamos</H>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>Criar e manter sua conta e enviar o código de acesso (execução do contrato).</li>
        <li>Liberar o Pro e controlar o período pago (execução do contrato).</li>
        <li>Ordenar as ofertas pelo que você curte, a partir das suas categorias e do que você abre no keropromo (legítimo interesse, para o serviço funcionar como prometido).</li>
        <li>Avisar sobre o vencimento do Pro e mudanças importantes no serviço.</li>
        <li>Segurança e prevenção de abuso (legítimo interesse).</li>
      </ul>
      <p>Não vendemos seus dados e não usamos para anúncios de terceiros.</p>

      <H>3. Com quem compartilhamos</H>
      <p>Só com os serviços que fazem o keropromo funcionar, e só o necessário:</p>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>Railway e Vercel: hospedagem do servidor e do site.</li>
        <li>Resend: envio dos e-mails (código de acesso e avisos).</li>
        <li>Mercado Pago: cobrança Pix do Pro.</li>
        <li>Apple e Expo: login com Apple e notificações do app.</li>
      </ul>
      <p>
        Alguns desses serviços guardam dados fora do Brasil, com as garantias previstas na LGPD. As lojas para onde você vai pelo botão &quot;Ir para a loja&quot; não recebem seus dados do keropromo.
      </p>

      <H>4. Quanto tempo guardamos</H>
      <p>
        Enquanto sua conta existir. Se você excluir a conta, apagamos seus dados de conta, preferências e uso. Registros de cobrança podem ser mantidos pelo prazo exigido por lei, e os registros de acesso ficam só pelo tempo que os serviços de hospedagem os guardam.
      </p>

      <H>5. Seus direitos</H>
      <p>
        Você pode pedir para confirmar, acessar, corrigir, levar para outro serviço ou apagar seus dados, além de saber com quem compartilhamos e revogar consentimentos. Para apagar tudo de uma vez, use &quot;Excluir conta&quot; em <Link href="/conta">Minha conta</Link>. Para os outros pedidos, escreva para <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Você também pode reclamar na Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <H>6. Cookies e armazenamento no navegador</H>
      <p>
        O site guarda no seu navegador apenas o que é preciso para manter você conectado (o acesso à conta e um sinal de &quot;conectado&quot;). Não usamos cookies de publicidade.
      </p>

      <H>7. Segurança</H>
      <p>
        Guardamos os códigos e acessos de forma protegida (só o resumo criptográfico deles) e usamos conexão segura (HTTPS) em tudo. Nenhum sistema é 100% seguro; se acontecer algum incidente que afete seus dados, avisamos você e a ANPD.
      </p>

      <H>8. Contato</H>
      <p>
        Responsável pelos dados (controlador) e encarregado: keropromo, pelo e-mail <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
