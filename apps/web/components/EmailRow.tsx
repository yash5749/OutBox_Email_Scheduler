'use client';

import { format } from 'date-fns';
import { ExternalLink, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

interface Email {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  sender: { id: string; displayName: string; fromEmail: string };
  campaignId: string | null;
  createdAt: string;
}

interface EmailRowProps {
  email: Email;
  showSentAt?: boolean;
}

const statusColors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  SCHEDULED: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: <Clock className="w-3.5 h-3.5" /> },
  SENDING: { bg: 'bg-yellow-50 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  SENT: { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  FAILED: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  CANCELLED: { bg: 'bg-slate-50 dark:bg-slate-900/30', text: 'text-slate-700 dark:text-slate-400', icon: <XCircle className="w-3.5 h-3.5" /> },
};

function Loader2({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

export function EmailRow({ email, showSentAt }: EmailRowProps) {
  const statusConfig = statusColors[email.status] || statusColors.SCHEDULED;

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900 dark:text-white">{email.recipient}</div>
      </td>
      <td className="px-4 py-3 max-w-md">
        <div className="text-slate-700 dark:text-slate-300 truncate" title={email.subject}>{email.subject}</div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
        {showSentAt && email.sentAt ? (
          format(new Date(email.sentAt), 'MMM d, yyyy HH:mm:ss')
        ) : (
          format(new Date(email.scheduledAt), 'MMM d, yyyy HH:mm:ss')
        )}
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-slate-900 dark:text-white">{email.sender.displayName}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{email.sender.fromEmail}</div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
          {statusConfig.icon}
          {email.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
        >
          View
        </button>
      </td>
    </tr>
  );
}