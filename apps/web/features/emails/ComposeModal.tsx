'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Upload, FileText, CheckCircle, AlertCircle, Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

const composeSchema = z.object({
  senderId: z.string().min(1, 'Select a sender'),
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required'),
  startAt: z.string().min(1, 'Start time is required'),
  minDelayBetweenEmailsMs: z.number().int().positive().min(100).max(3600000),
  maxEmailsPerHour: z.number().int().positive().min(1).max(10000),
});

type ComposeFormData = z.infer<typeof composeSchema>;

interface ComposeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Sender {
  id: string;
  displayName: string;
  fromEmail: string;
  hourlyLimit: number | null;
  minDelayMs: number | null;
}

interface ParseResult {
  valid: number;
  invalid: number;
  duplicates: number;
  invalidRows: Array<{ row: number; email: string; reason: string }>;
}

export function ComposeModal({ onClose, onSuccess }: ComposeModalProps) {
  const toast = useToast();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ComposeFormData>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      minDelayBetweenEmailsMs: 2000,
      maxEmailsPerHour: 200,
      startAt: new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16),
    },
  });

  const watchedStartAt = watch('startAt');

  useEffect(() => {
    async function fetchSenders() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/senders`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setSenders(data.data);
          if (data.data.length > 0) {
            setValue('senderId', data.data[0].id);
          }
        }
      } catch {
        toast.error('Failed to load senders');
      } finally {
        setLoadingSenders(false);
      }
    }
    fetchSenders();
  }, [setValue, toast]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const content = await file.text();
    const mimeType = file.type || (file.name.endsWith('.csv') ? 'text/csv' : 'text/plain');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/emails/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content, mimeType }),
      });

      if (res.ok) {
        const data = await res.json();
        setParseResult(data.data);
      } else {
        toast.error('Failed to parse file');
      }
    } catch {
      toast.error('Failed to parse file');
    }
  };

  const removeFile = () => {
    setFileName(null);
    setParseResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onSubmit = async (data: ComposeFormData) => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('senderId', data.senderId);
      formData.append('subject', data.subject);
      formData.append('body', data.body);
      formData.append('startAt', new Date(data.startAt).toISOString());
      formData.append('minDelayBetweenEmailsMs', data.minDelayBetweenEmailsMs.toString());
      formData.append('maxEmailsPerHour', data.maxEmailsPerHour.toString());

      if (fileInputRef.current?.files?.[0]) {
        formData.append('file', fileInputRef.current.files[0]);
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/emails/schedule`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const result = await res.json();

      if (res.ok) {
        toast.success(`${result.data.scheduledCount} emails scheduled`);
        onSuccess();
      } else {
        toast.error(result.error?.message || 'Failed to schedule emails');
      }
    } catch {
      toast.error('Failed to schedule emails');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Compose New Email</h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sender</label>
            {loadingSenders ? (
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
            ) : (
              <select
                {...register('senderId')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {senders.map(sender => (
                  <option key={sender.id} value={sender.id}>
                    {sender.displayName} ({sender.fromEmail})
                  </option>
                ))}
              </select>
            )}
            {errors.senderId && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.senderId.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject</label>
            <input
              {...register('subject')}
              type="text"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Enter email subject"
            />
            {errors.subject && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.subject.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Body</label>
            <textarea
              {...register('body')}
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              placeholder="Enter email body (plain text)"
            />
            {errors.body && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.body.message}</p>}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Recipients</h3>

            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 text-center hover:border-primary-500 transition-colors">
                {fileName ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-6 h-6 text-slate-500" />
                      <span className="text-slate-700 dark:text-slate-300">{fileName}</span>
                    </div>
                    <button type="button" onClick={removeFile} className="text-slate-500 hover:text-red-600">Remove</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-400">Drag & drop CSV or text file</span>
                    <span className="text-xs text-slate-500">One email per line or CSV with "email" column</span>
                  </div>
                )}
              </div>
            </div>

            {parseResult && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/30 rounded-lg space-y-2">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    {parseResult.valid} valid
                  </span>
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    {parseResult.invalid} invalid
                  </span>
                  <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                    <AlertCircle className="w-4 h-4" />
                    {parseResult.duplicates} duplicates
                  </span>
                </div>
                {parseResult.invalidRows.length > 0 && (
                  <details className="text-xs text-slate-600 dark:text-slate-400">
                    <summary className="cursor-pointer">Show invalid rows</summary>
                    <ul className="mt-1 space-y-1">
                      {parseResult.invalidRows.slice(0, 10).map((row, i) => (
                        <li key={i}>Row {row.row}: {row.email} — {row.reason}</li>
                      ))}
                      {parseResult.invalidRows.length > 10 && (
                        <li>... and {parseResult.invalidRows.length - 10} more</li>
                      )}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-200 dark:border-slate-700 pt-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Time</label>
              <Controller
                name="startAt"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                )}
              />
              {errors.startAt && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.startAt.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Min Delay (ms)</label>
              <Controller
                name="minDelayBetweenEmailsMs"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="number"
                    min="100"
                    max="3600000"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hourly Limit</label>
              <Controller
                name="maxEmailsPerHour"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="number"
                    min="1"
                    max="10000"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                )}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 pt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Schedule Emails
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}