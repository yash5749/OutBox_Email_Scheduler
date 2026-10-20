'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { X, Slack, CheckCircle, Loader2, Link } from 'lucide-react';

interface SlackStatus {
  connected: boolean;
  teamName?: string;
  teamId?: string;
  channelId?: string;
  channelName?: string;
  connectedAt?: string;
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [slackStatus, setSlackStatus] = useState<SlackStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchSlackStatus();
  }, []);

  const fetchSlackStatus = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/integrations/slack/status`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setSlackStatus(data.data);
      }
    } catch {
      toast.error('Failed to load Slack status');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    setConnecting(true);
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/integrations/slack/connect`;
  };

  const handleDisconnect = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/integrations/slack/disconnect`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Slack disconnected');
        fetchSlackStatus();
      } else {
        toast.error('Failed to disconnect Slack');
      }
    } catch {
      toast.error('Failed to disconnect Slack');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Slack className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-medium text-slate-900 dark:text-white">Slack Notifications</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Receive rate limit alerts</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              </div>
            ) : slackStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Connected</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Workspace</span>
                    <span className="font-medium text-slate-900 dark:text-white">{slackStatus.teamName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Channel</span>
                    <span className="font-medium text-slate-900 dark:text-white">#{slackStatus.channelName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Connected</span>
                    <span className="font-medium text-slate-900 dark:text-white">{slackStatus.connectedAt ? new Date(slackStatus.connectedAt).toLocaleDateString() : 'Unknown'}</span>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="w-full px-4 py-2 text-red-600 dark:text-red-400 font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Disconnect Slack
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  Connect Slack to receive real-time notifications when email sending rate limits are reached.
                </p>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="w-full px-4 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Slack className="w-5 h-5" />
                  {connecting ? 'Connecting...' : 'Connect Slack'}
                </button>
              </div>
            )}
          </div>

          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            <p>ReachInbox v0.1.0</p>
          </div>
        </div>
      </div>
    </div>
  );
}