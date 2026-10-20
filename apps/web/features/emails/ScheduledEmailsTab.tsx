'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';
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
}

interface EmailListResponse {
  items: Email[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function ScheduledEmailsTab() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('SCHEDULED');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalHits, setTotalHits] = useState(0);
  const toast = useToast();

  const fetchEmails = useCallback(async (reset = false) => {
    const nextCursor = reset ? null : cursor;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (statusFilter) params.set('status', statusFilter);
      if (nextCursor) params.set('cursor', nextCursor);
      params.set('limit', '50');

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/emails/search?${params}`, {
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to fetch emails');

      const data = await res.json();
      const newEmails = data.data.items || [];

      if (reset) {
        setEmails(newEmails);
      } else {
        setEmails(prev => [...prev, ...newEmails]);
      }
      setCursor(data.data.nextCursor || null);
      setHasMore(data.data.hasMore || false);
      setTotalHits(data.data.totalHits || 0);
    } catch (err) {
      toast.error('Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, cursor, toast]);

  useEffect(() => {
    fetchEmails(true);
  }, [searchQuery, statusFilter]);

  const handleLoadMore = () => {
    if (hasMore && !loading) fetchEmails(false);
  };

  if (emails.length === 0 && !loading) {
    return (
      <div className="text-center py-12">
        <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">No scheduled emails</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Click Compose to schedule your first campaign</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search recipients, subject..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
          >
            <option value="SCHEDULED">Scheduled</option>
            <option value="SENDING">Sending</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <span className="text-sm text-slate-500 dark:text-slate-400">{totalHits} total</span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scheduled</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sender</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading && emails.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
                  </td>
                </tr>
              ) : (
                emails.map(email => (
                  <EmailRow key={email.id} email={email} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Load more'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}