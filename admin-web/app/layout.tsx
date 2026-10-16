import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Geno — Administration',
  description: 'Panneau d administration Geno : statistiques, moderation et articles coaching.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
