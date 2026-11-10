import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/inter';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { MobileNav } from '../components/MobileNav';
import { HideOnStudio } from '../components/HideOnStudio';
import { SessionProvider } from '../components/Session';
import { SITE_URL } from '../lib/api';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'keropromo — promoção de verdade, na hora que ela aparece', template: '%s · keropromo' },
  description:
    'Vigiamos Mercado Livre, Shopee e mais de 20 lojas a cada 5 minutos e guardamos o histórico de cada preço, para você pegar a promoção de verdade.',
  openGraph: { siteName: 'keropromo', locale: 'pt_BR', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#16130F' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <SessionProvider>
          <HideOnStudio>
            <Header />
          </HideOnStudio>
          <main>{children}</main>
          <HideOnStudio>
            <Footer />
            <MobileNav />
          </HideOnStudio>
        </SessionProvider>
      </body>
    </html>
  );
}
