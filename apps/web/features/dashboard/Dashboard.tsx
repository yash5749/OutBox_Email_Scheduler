'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { ScheduledEmailsTab } from '@/features/emails/ScheduledEmailsTab';
import { SentEmailsTab } from '@/features/emails/SentEmailsTab';
import { ComposeModal } from '@/features/emails/ComposeModal';
import { SettingsModal } from '@/features/settings/SettingsModal';
import { Toaster } from 'react-hot-toast';

interface User {
  name: string;
  email: string;
  avatarUrl: string | null;
}

type Tab = 'scheduled' | 'sent' | 'failed';

export function Dashboard({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<Tab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = async () => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header
        user={user}
        onLogout={handleLogout}
        onCompose={() => setComposeOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Manage your email campaigns and track delivery</p>
          </div>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-700 mb-6">
          <nav className="flex gap-1" aria-label="Email tabs">
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'scheduled'
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Scheduled
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'sent'
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Sent
            </button>
            <button
              onClick={() => setActiveTab('failed')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'failed'
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Failed
            </button>
          </nav>
        </div>

        {activeTab === 'scheduled' && <ScheduledEmailsTab />}
        {activeTab === 'sent' && <SentEmailsTab />}
        {activeTab === 'failed' && <SentEmailsTab status="FAILED" />}

        {composeOpen && (
          <ComposeModal onClose={() => setComposeOpen(false)} onSuccess={() => setComposeOpen(false)} />
        )}

        {settingsOpen && (
          <SettingsModal onClose={() => setSettingsOpen(false)} />
        )}
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { background: '#1e293b', color: '#f8fafc' },
          success: { iconTheme: { primary: '#10b981', secondary: '#f8fafc' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#f8fafc' } },
        }}
      />
    </div>
  );
}