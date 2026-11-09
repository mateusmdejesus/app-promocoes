import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/inter';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { MobileNav } from '../components/MobileNav';
import { SessionProvider } from '../components/Session';
import { SITE_URL } from '../lib/api';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'keropromo — promoção de verdade, na hora que ela aparece', template: '%s · keropromo' },
  description:
    'Vigiamos Mercado Livre e Amazon a cada 5 minutos e mostramos só desconto real, comparado ao preço dos últimos 90 dias. Avisos no Telegram.',
  openGraph: { siteName: 'keropromo', locale: 'pt_BR', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#16130F' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <SessionProvider>
          <Header />
          <main>{children}</main>
          <Footer />
          <MobileNav />
        </SessionProvider>
      </body>
    </html>
  );
}
