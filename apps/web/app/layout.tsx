import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReachInbox — Email Scheduler',
  description: 'Schedule, search and manage outreach emails.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
