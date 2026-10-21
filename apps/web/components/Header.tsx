'use client';

import { useState } from 'react';
import {
  ChevronDown,
  Clock,
  LogOut,
  Send,
  Settings,
  Plus,
  X,
} from 'lucide-react';

export type EmailTab = 'scheduled' | 'sent';

interface HeaderProps {
  user: { name: string; email: string; avatarUrl: string | null };
  activeTab: EmailTab;
  onSelectTab: (tab: EmailTab) => void;
  onLogout: () => void;
  onCompose: () => void;
  onSettings: () => void;
}

export function Header({
  user,
  activeTab,
  onSelectTab,
  onLogout,
  onCompose,
  onSettings,
}: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <aside className="ri-sidebar">
      <a href="/" className="ri-wordmark" aria-label="ReachInbox home">
        ONB
      </a>

      <div className="ri-user-wrap">
        <button
          type="button"
          className="ri-user-card"
          onClick={() => setUserMenuOpen((open) => !open)}
          aria-expanded={userMenuOpen}
          aria-haspopup="menu"
        >
          {user.avatarUrl ? (
            // Google profile images are supplied by the authenticated account.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="ri-avatar" />
          ) : (
            <span className="ri-avatar ri-avatar-fallback">
              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </span>
          )}
          <span className="ri-user-copy">
            <span className="ri-user-name">{user.name || 'Account'}</span>
            <span className="ri-user-email">{user.email}</span>
          </span>
          {userMenuOpen ? <X size={15} /> : <ChevronDown size={15} />}
        </button>

        {userMenuOpen && (
          <div className="ri-profile-menu" role="menu">
            <div className="ri-profile-menu-user">
              <strong>{user.name || 'Account'}</strong>
              <span>{user.email}</span>
            </div>
            <button type="button" role="menuitem" onClick={onSettings}>
              <Settings size={15} /> Settings
            </button>
            <button type="button" role="menuitem" onClick={onLogout} className="ri-logout-item">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>

      <button type="button" className="ri-compose-button" onClick={onCompose}>
        <Plus size={16} strokeWidth={1.9} />
        Compose
      </button>

      <div className="ri-sidebar-section-label">CORE</div>
      <nav className="ri-sidebar-nav" aria-label="Email folders">
        <button
          type="button"
          className={`ri-nav-item ${activeTab === 'scheduled' ? 'is-active' : ''}`}
          onClick={() => onSelectTab('scheduled')}
          aria-current={activeTab === 'scheduled' ? 'page' : undefined}
        >
          <Clock size={16} strokeWidth={1.8} />
          <span>Scheduled</span>
        </button>
        <button
          type="button"
          className={`ri-nav-item ${activeTab === 'sent' ? 'is-active' : ''}`}
          onClick={() => onSelectTab('sent')}
          aria-current={activeTab === 'sent' ? 'page' : undefined}
        >
          <Send size={16} strokeWidth={1.8} />
          <span>Sent</span>
        </button>
      </nav>

    </aside>
  );
}
