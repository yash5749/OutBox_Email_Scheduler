'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2, Filter, RefreshCw, Clock, Mail } from 'lucide-react';
import { EmailRow } from '@/components/EmailRow';
import { useToast } from '@/hooks/useToast';

interface Email {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  scheduledAt: string;
  sender: { id: string; displayName: string; fromEmail: string };
  campaignId: string | null;
  createdAt: string;
  body?: string | null;
  preview?: string | null;
  snippet?: string | null;
}

export function ScheduledEmailsTab() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('SCHEDULED');
  const [filterOpen, setFilterOpen] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalHits, setTotalHits] = useState(0);
  const toast = useToast();

  const fetchEmails = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (statusFilter) params.set('status', statusFilter);
      const nextCursor = reset ? null : cursorRef.current;
      if (nextCursor) params.set('cursor', nextCursor);
      params.set('limit', '50');

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/emails/search?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch emails');

      const result = await res.json();
      const data = result.data || {};
      const nextItems: Email[] = data.items || [];
      setEmails((current) => reset ? nextItems : [...current, ...nextItems]);
      cursorRef.current = data.nextCursor || null;
      setHasMore(Boolean(data.hasMore));
      setTotalHits(Number(data.totalHits || 0));
    } catch {
      toast.error('Failed to load scheduled emails');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchEmails(true); }, 180);
    return () => window.clearTimeout(timer);
  }, [fetchEmails]); // Query/filter changes recreate fetchEmails and reset pagination.

  const refresh = () => { void fetchEmails(true); };
  const loadMore = () => {
    if (hasMore && !loading) void fetchEmails(false);
  };

  return (
    <section className="ri-mail-view" aria-label="Scheduled emails">
      <div className="ri-mail-toolbar">
        <div className="ri-search-box">
          <Search size={16} strokeWidth={1.8} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search scheduled emails"
          />
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>}
        </div>
        <div className="ri-toolbar-actions">
          <div className="ri-filter-wrap">
            <button type="button" className={`ri-icon-button ${filterOpen ? 'is-active' : ''}`} onClick={() => setFilterOpen((open) => !open)} aria-label="Filter emails" title="Filter">
              <Filter size={16} />
            </button>
            {filterOpen && (
              <div className="ri-filter-popover">
                <label htmlFor="scheduled-status-filter">Status</label>
                <select id="scheduled-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="SENDING">Sending</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <span>{totalHits} matching emails</span>
              </div>
            )}
          </div>
          <button type="button" className="ri-icon-button" onClick={refresh} aria-label="Refresh scheduled emails" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="ri-email-list" aria-live="polite">
        {loading && emails.length === 0 ? (
          <div className="ri-list-state"><Loader2 className="animate-spin" size={24} /><span>Loading scheduled emails…</span></div>
        ) : emails.length === 0 ? (
          <div className="ri-list-state ri-empty-state">
            <span className="ri-empty-icon"><Clock size={22} /></span>
            <strong>{searchQuery ? 'No matching emails' : 'No scheduled emails'}</strong>
            <span>{searchQuery ? 'Try another search term or change the status filter.' : 'Compose an email and schedule it to appear here.'}</span>
          </div>
        ) : (
          emails.map((email, index) => <EmailRow key={index} email={email} />)
        )}
      </div>

      {hasMore && (
        <div className="ri-load-more-wrap">
          <button type="button" className="ri-load-more" onClick={loadMore} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {loading ? 'Loading…' : `Load more (${totalHits} total)`}
          </button>
        </div>
      )}
    </section>
  );
}
