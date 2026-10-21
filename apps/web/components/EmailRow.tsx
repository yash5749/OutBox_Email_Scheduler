'use client';

import { useState } from 'react';
import { format, isValid } from 'date-fns';
import { Clock, Star, CheckCircle, XCircle, Loader2 } from 'lucide-react';

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
  body?: string | null;
  preview?: string | null;
  snippet?: string | null;
}

interface EmailRowProps {
  email: Email;
  showSentAt?: boolean;
}

function safeDateLabel(value?: string | null) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return isValid(date) ? format(date, 'EEE h:mm:ss a') : 'Time unavailable';
}

export function EmailRow({ email, showSentAt = false }: EmailRowProps) {
  const [starred, setStarred] = useState(false);
  const status = (email.status || 'SCHEDULED').toUpperCase();
  const preview = email.preview || email.snippet || email.body || 'No message preview available';

  return (
    <article className="ri-email-row">
      <div className="ri-email-recipient" title={email.recipient}>
        <span>To: {email.recipient}</span>
      </div>

      <div className="ri-email-summary">
        {showSentAt ? (
          <span className={`ri-mail-status-badge ${status === 'FAILED' ? 'is-failed' : 'is-sent'}`}>
            {status === 'FAILED' ? <XCircle size={12} /> : status === 'SENDING' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            {status === 'FAILED' ? 'Failed' : status === 'SENDING' ? 'Sending' : 'Sent'}
          </span>
        ) : (
          <span className="ri-scheduled-time" title={email.scheduledAt}>
            <Clock size={12} /> {safeDateLabel(email.scheduledAt)}
          </span>
        )}
        <div className="ri-email-subject-line" title={email.subject}>
          <strong>{email.subject || '(No subject)'}</strong>
          <span className="ri-email-preview"> — {preview}</span>
        </div>
      </div>

      <button
        type="button"
        className={`ri-star-button ${starred ? 'is-starred' : ''}`}
        onClick={() => setStarred((current) => !current)}
        aria-label={starred ? 'Remove star' : 'Star email'}
        title={starred ? 'Remove star' : 'Star email'}
      >
        <Star size={16} fill={starred ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}
