'use client';

import { useState, useEffect } from 'react';
import { Header, type EmailTab } from '@/components/Header';
import { ScheduledEmailsTab } from '@/features/emails/ScheduledEmailsTab';
import { SentEmailsTab } from '@/features/emails/SentEmailsTab';
import { ComposeModal } from '@/features/emails/ComposeModal';
import { SettingsModal } from '@/features/settings/SettingsModal';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

interface User {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export function Dashboard({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<EmailTab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Handle Slack OAuth callback redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack_connected') === 'true') {
      toast.success('Slack connected successfully!');
      setSettingsOpen(true);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('slack_error')) {
      const error = params.get('slack_error');
      toast.error(`Slack connection failed: ${error}`);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      window.location.href = '/';
    }
  };

  return (
    <div className="ri-app-shell">
      <Header
        user={user}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLogout={handleLogout}
        onCompose={() => setComposeOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className="ri-main-panel" aria-label={`${activeTab} emails`}>
        {activeTab === 'scheduled' ? <ScheduledEmailsTab /> : <SentEmailsTab />}
      </main>

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSuccess={() => {
            setComposeOpen(false);
            setActiveTab('scheduled');
          }}
        />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#202522',
            color: '#fff',
            borderRadius: '10px',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#00a63e', secondary: '#fff' } },
          error: { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
        }}
      />
    </div>
  );
}
