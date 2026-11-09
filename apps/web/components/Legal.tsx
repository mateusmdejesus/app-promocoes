/** Contato publicado nos Termos e na Privacidade. */
export const CONTACT_EMAIL = 'contato@keropromo.com.br';
export const LEGAL_UPDATED = '9 de novembro de 2026';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 760 }}>
      <h1 className="h2">{title}</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        Última atualização: {LEGAL_UPDATED}
      </p>
      <div className="legal" style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 14, lineHeight: 1.65, fontSize: 16 }}>
        {children}
      </div>
    </div>
  );
}

export function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="h3" style={{ marginTop: 20 }}>
      {children}
    </h2>
  );
}
