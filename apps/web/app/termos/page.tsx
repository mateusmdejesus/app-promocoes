import Link from 'next/link';
import { CONTACT_EMAIL, H, LegalPage } from '../../components/Legal';

export const metadata = { title: 'Termos de Uso' };

export default function Page() {
  return (
    <LegalPage title="Termos de Uso">
      <p>
        Estes termos valem para o site keropromo.com.br e o app keropromo (o &quot;keropromo&quot;). Ao criar uma conta ou assinar o Pro, você concorda com eles. Se não concordar, não use o serviço.
      </p>

      <H>1. O que o keropromo faz</H>
      <p>
        O keropromo acompanha preços de produtos em lojas online (como Mercado Livre, Shopee e lojas parceiras), guarda o histórico desses preços e mostra as promoções que encontra. Nós <strong>não vendemos</strong> nenhum produto: a compra é feita direto na loja, que é a responsável pelo produto, pela entrega, pela troca e pela garantia.
      </p>
      <p>
        Os preços e o estoque mudam o tempo todo e são informados pelas próprias lojas. Fazemos o possível para mostrar dados atualizados, mas o preço que vale é o que aparece na loja no momento da compra. Confira sempre antes de comprar.
      </p>

      <H>2. Sua conta</H>
      <p>
        Você entra com o seu e-mail e um código de acesso. Mantenha o acesso ao seu e-mail seguro: quem tiver o código entra na sua conta. Você pode sair ou excluir a conta a qualquer momento em <Link href="/conta">Minha conta</Link>.
      </p>

      <H>3. Plano grátis e Pro</H>
      <p>
        O plano grátis mostra as promoções de 25% ou mais e as ofertas quentes (40% ou mais) uma hora depois de aparecerem. O Pro mostra as ofertas quentes na hora, com preço e link, e o histórico de preço de até 90 dias. O que cada plano inclui está descrito em <Link href="/pro">Preços</Link>; quando um recurso estiver marcado como &quot;em breve&quot;, ele ainda não faz parte do que é cobrado.
      </p>

      <H>4. Pagamento</H>
      <p>
        O Pro é pago por Pix, processado pelo Mercado Pago: mensal (30 dias) ou anual (12 meses). <strong>Não há cobrança automática.</strong> Antes de o período acabar, avisamos e enviamos um novo Pix; se você não pagar, a conta volta para o plano grátis, sem multa. Pagar antes do vencimento soma o novo período ao que ainda falta.
      </p>

      <H>5. Arrependimento e reembolso</H>
      <p>
        Você pode desistir da assinatura em até 7 dias depois do pagamento (art. 49 do Código de Defesa do Consumidor) e receber o valor de volta. Para isso, escreva para <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> com o e-mail da sua conta. Depois desses 7 dias, o período já pago continua valendo até o fim, mas não é reembolsado.
      </p>

      <H>6. Uso correto</H>
      <p>
        Não é permitido copiar em massa os dados do keropromo, usar robôs para acessar o serviço, revender o acesso ou tentar burlar os limites dos planos. Podemos suspender contas que fizerem isso.
      </p>

      <H>7. Links para lojas</H>
      <p>
        Os botões &quot;Ir para a loja&quot; levam para sites de terceiros, com termos e políticas próprios. O keropromo não é responsável pelo conteúdo, pelas vendas ou pelo atendimento dessas lojas.
      </p>

      <H>8. Disponibilidade e limites de responsabilidade</H>
      <p>
        Trabalhamos para o keropromo ficar no ar o tempo todo, mas pode haver falhas, atrasos na atualização dos preços ou lojas que deixam de ser acompanhadas. Na medida permitida pela lei, não respondemos por compras feitas com base em informações que mudaram na loja.
      </p>

      <H>9. Mudanças</H>
      <p>
        Podemos atualizar estes termos. Quando a mudança for importante, avisamos por e-mail ou no site antes de ela valer. Mudanças de preço do Pro não afetam o período que você já pagou.
      </p>

      <H>10. Contato</H>
      <p>
        Dúvidas, pedidos e reclamações: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Estes termos seguem as leis do Brasil, e o consumidor pode usar o foro do seu domicílio.
      </p>
    </LegalPage>
  );
}
