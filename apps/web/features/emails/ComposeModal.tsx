'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  X,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  Undo2,
  Redo2,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  ListOrdered,
  List,
  IndentIncrease,
  IndentDecrease,
  Quote,
  AlignJustify,
  Strikethrough,
  CalendarDays,
  ChevronDown,
} from 'lucide-react';
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function toLocalDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function extractEmails(content: string) {
  const found = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(found.map((email) => email.trim().toLowerCase())));
}

function makeTomorrowAt(hour: number, minute = 0) {
  const tomorrow = addDays(new Date(), 1);
  return setMilliseconds(setSeconds(setMinutes(setHours(tomorrow, hour), minute), 0), 0);
}

export function ComposeModal({ onClose, onSuccess }: ComposeModalProps) {
  const toast = useToast();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [detectedRecipients, setDetectedRecipients] = useState<string[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [hasChosenSchedule, setHasChosenSchedule] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

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
      senderId: '',
      subject: '',
      body: '',
      minDelayBetweenEmailsMs: 2000,
      maxEmailsPerHour: 200,
      startAt: toLocalDateTimeInput(new Date(Date.now() + 5 * 60 * 1000)),
    },
  });

  const senderId = watch('senderId');
  const startAt = watch('startAt');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (scheduleOpen) setScheduleOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, scheduleOpen]);

  useEffect(() => {
    async function fetchSenders() {
      try {
        const res = await fetch(`${API_URL}/api/senders`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load senders');
        const result = await res.json();
        const nextSenders: Sender[] = result.data || [];
        setSenders(nextSenders);
        if (nextSenders.length > 0) {
          setValue('senderId', nextSenders[0].id);
          if (nextSenders[0].hourlyLimit) setValue('maxEmailsPerHour', nextSenders[0].hourlyLimit);
          if (nextSenders[0].minDelayMs) setValue('minDelayBetweenEmailsMs', nextSenders[0].minDelayMs);
        }
      } catch {
        toast.error('Failed to load senders');
      } finally {
        setLoadingSenders(false);
      }
    }
    void fetchSenders();
  }, [setValue, toast]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast.error('Upload a CSV or text file');
      event.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be smaller than 10 MB');
      event.target.value = '';
      return;
    }

    setFileName(file.name);
    setParsing(true);
    setParseResult(null);
    try {
      const content = await file.text();
      setDetectedRecipients(extractEmails(content));
      const mimeType = file.type || (file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'text/plain');
      const response = await fetch(`${API_URL}/api/emails/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content, mimeType }),
      });

      if (response.ok) {
        const result = await response.json();
        setParseResult(result.data);
      } else {
        // Keep the local email count visible even when the optional parser endpoint is unavailable.
        setParseResult({ valid: extractEmails(content).length, invalid: 0, duplicates: 0, invalidRows: [] });
      }
    } catch {
      toast.error('The file could not be read');
      setDetectedRecipients([]);
    } finally {
      setParsing(false);
    }
  };

  const removeFile = () => {
    setFileName(null);
    setParseResult(null);
    setDetectedRecipients([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onSubmit = async (data: ComposeFormData) => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error('Upload a CSV or text file containing recipient email addresses');
      return;
    }
    const selectedStart = new Date(data.startAt);
    if (!Number.isFinite(selectedStart.getTime()) || selectedStart.getTime() <= Date.now()) {
      toast.error('Choose a start time in the future');
      setScheduleOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('senderId', data.senderId);
      formData.append('subject', data.subject);
      formData.append('body', data.body);
      formData.append('startAt', selectedStart.toISOString());
      formData.append('minDelayBetweenEmailsMs', String(data.minDelayBetweenEmailsMs));
      formData.append('maxEmailsPerHour', String(data.maxEmailsPerHour));
      formData.append('file', file);

      const response = await fetch(`${API_URL}/api/emails/schedule`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Failed to schedule emails');

      toast.success(`${result.data?.scheduledCount ?? detectedRecipients.length} emails scheduled`);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to schedule emails');
    } finally {
      setSubmitting(false);
    }
  };

  const setPreset = (date: Date) => {
    setValue('startAt',(toLocalDateTimeInput(date)), { shouldValidate: true, shouldDirty: true });
    setHasChosenSchedule(true);
  };

  const bodyRegistration = register('body');

  const toolbarButton = (label: string, Icon: typeof Bold, action?: () => void) => (
    <button key={label} type="button" className="ri-editor-tool" title={label} aria-label={label} onClick={action}>
      <Icon size={16} strokeWidth={1.8} />
    </button>
  );

  return (
    <div
      className="ri-compose-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-heading"
    >
      <header className="ri-compose-header">
        <div className="ri-compose-heading-wrap">
          <button
            type="button"
            className="ri-compose-back"
            onClick={onClose}
            aria-label="Back to inbox"
            title="Back"
          >
            <ArrowLeft size={22} strokeWidth={1.7} />
          </button>
          <h1 id="compose-heading">Compose New Email</h1>
        </div>
        <div className="ri-compose-header-actions">
          <button
            type="button"
            className="ri-compose-tool-button"
            title="Upload recipient list"
            aria-label="Upload recipient list"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={19} strokeWidth={1.8} />
            {fileName && <span className="ri-attachment-count">1</span>}
          </button>
          <button
            type="button"
            className={`ri-compose-tool-button ${scheduleOpen ? "is-active" : ""}`}
            title="Schedule send"
            aria-label="Schedule send"
            onClick={() => setScheduleOpen((open) => !open)}
          >
            <Clock size={19} strokeWidth={1.8} />
          </button>
          <button
            type="submit"
            form="compose-email-form"
            className="ri-send-button"
            disabled={submitting || loadingSenders || !senderId}
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {submitting
              ? "Scheduling…"
              : hasChosenSchedule
                ? "Send Later"
                : "Send"}
          </button>
        </div>
      </header>

      {scheduleOpen && (
        <div
          className="ri-schedule-popover"
          role="dialog"
          aria-label="Send later options"
        >
          <div className="ri-schedule-popover-title">Send Later</div>
          <label className="ri-date-input-wrap">
            <span className="sr-only">Pick date and time</span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(event) => {
                if (event.target.value) setPreset(new Date(event.target.value));
              }}
            />
            <CalendarDays size={16} />
          </label>
          <div className="ri-schedule-presets">
            <button
              type="button"
              onClick={() =>
                setPreset(
                  makeTomorrowAt(
                    new Date().getHours(),
                    new Date().getMinutes(),
                  ),
                )
              }
            >
              Tomorrow
            </button>
            <button type="button" onClick={() => setPreset(makeTomorrowAt(10))}>
              Tomorrow, 10:00 AM
            </button>
            <button type="button" onClick={() => setPreset(makeTomorrowAt(11))}>
              Tomorrow, 11:00 AM
            </button>
            <button type="button" onClick={() => setPreset(makeTomorrowAt(15))}>
              Tomorrow, 3:00 PM
            </button>
          </div>
          <div className="ri-schedule-popover-footer">
            <button
              type="button"
              className="ri-text-button"
              onClick={() => setScheduleOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ri-outline-green-button"
              onClick={() => {
                setHasChosenSchedule(true);
                setScheduleOpen(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <form
        id="compose-email-form"
        onSubmit={handleSubmit(onSubmit)}
        className="ri-compose-form"
      >
        <input type="hidden" {...register("startAt")} />

        <div className="ri-compose-fields">
          <div className="ri-compose-field-row">
            <label htmlFor="compose-sender">From</label>
            <div className="ri-from-select-wrap">
              {loadingSenders ? (
                <span className="ri-sender-loading">
                  <Loader2 size={14} className="animate-spin" /> Loading
                  senders…
                </span>
              ) : (
                <select
                  id="compose-sender"
                  {...register("senderId")}
                  disabled={senders.length === 0}
                >
                  {senders.length === 0 && (
                    <option value="">No senders connected</option>
                  )}
                  {senders.map((sender) => (
                    <option key={sender.id} value={sender.id}>
                      {sender.fromEmail}
                    </option>
                  ))}
                </select>
              )}
              <ChevronDown size={15} />
            </div>
            {errors.senderId && (
              <p className="ri-compose-error">{errors.senderId.message}</p>
            )}
          </div>

          <div className="ri-compose-field-row ri-to-row">
            <label>To</label>
            <div className="ri-recipient-line">
              <div className="ri-recipient-chips" aria-live="polite">
                {detectedRecipients.length === 0 ? (
                  <span className="ri-recipient-placeholder">
                    recipient@example.com
                  </span>
                ) : (
                  <>
                    {detectedRecipients.slice(0, 3).map((recipient) => (
                      <span className="ri-recipient-chip" key={recipient}>
                        {recipient}
                      </span>
                    ))}
                    {detectedRecipients.length > 3 && (
                      <span className="ri-recipient-chip ri-more-chip">
                        +{detectedRecipients.length - 3}
                      </span>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                className="ri-upload-list-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={15} /> Upload List
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={handleFileChange}
                className="ri-hidden-file-input"
              />
            </div>
          </div>

          <div className="ri-compose-field-row">
            <label htmlFor="compose-subject">Subject</label>
            <div className="ri-subject-input-wrap">
              <input
                id="compose-subject"
                {...register("subject")}
                placeholder="Subject"
              />
              {errors.subject && (
                <p className="ri-compose-error">{errors.subject.message}</p>
              )}
            </div>
          </div>

          <div className="ri-sending-rules-row">
            <label htmlFor="compose-delay">Delay between 2 emails</label>
            <Controller
              name="minDelayBetweenEmailsMs"
              control={control}
              render={({ field }) => (
                <input
                  id="compose-delay"
                  type="number"
                  min={100}
                  max={3600000}
                  value={field.value}
                  onChange={(event) =>
                    field.onChange(Number(event.target.value))
                  }
                />
              )}
            />
            <span className="ri-field-hint">ms</span>
            <label htmlFor="compose-hourly-limit">Hourly Limit</label>
            <Controller
              name="maxEmailsPerHour"
              control={control}
              render={({ field }) => (
                <input
                  id="compose-hourly-limit"
                  type="number"
                  min={1}
                  max={10000}
                  value={field.value}
                  onChange={(event) =>
                    field.onChange(Number(event.target.value))
                  }
                />
              )}
            />
            <span className="ri-field-hint">emails</span>
          </div>
          {(errors.minDelayBetweenEmailsMs || errors.maxEmailsPerHour) && (
            <p className="ri-compose-error">
              {errors.minDelayBetweenEmailsMs?.message ||
                errors.maxEmailsPerHour?.message}
            </p>
          )}

          <div className="ri-message-editor">
            <textarea
              {...bodyRegistration}
              ref={(element) => {
                bodyRegistration.ref(element);
                bodyRef.current = element;
              }}
              placeholder="Type Your Reply..."
              aria-label="Email body"
              className="ri-message-body"
            />
            {errors.body && (
              <p className="ri-compose-error ri-body-error">
                {errors.body.message}
              </p>
            )}
            <div className="ri-editor-toolbar" aria-label="Formatting toolbar">
              {toolbarButton("Undo", Undo2, () => document.execCommand("undo"))}
              {toolbarButton("Redo", Redo2, () => document.execCommand("redo"))}
              <span className="ri-toolbar-divider" />
              {toolbarButton("Text options", Type, () =>
                bodyRef.current?.focus(),
              )}
              <span className="ri-toolbar-divider" />
              {toolbarButton("Bold", Bold, () => {
                bodyRef.current?.focus();
                document.execCommand("bold");
              })}
              {toolbarButton("Italic", Italic, () => {
                bodyRef.current?.focus();
                document.execCommand("italic");
              })}
              {toolbarButton("Underline", Underline, () => {
                bodyRef.current?.focus();
                document.execCommand("underline");
              })}
              <span className="ri-toolbar-divider" />
              {toolbarButton("Align left", AlignLeft, () =>
                bodyRef.current?.focus(),
              )}
              {toolbarButton("Line spacing", ChevronDown, () =>
                bodyRef.current?.focus(),
              )}
              <span className="ri-toolbar-divider" />
              {toolbarButton("Numbered list", ListOrdered, () =>
                bodyRef.current?.focus(),
              )}
              {toolbarButton("Bulleted list", List, () =>
                bodyRef.current?.focus(),
              )}
              {toolbarButton("Increase indent", IndentIncrease, () =>
                bodyRef.current?.focus(),
              )}
              {toolbarButton("Decrease indent", IndentDecrease, () =>
                bodyRef.current?.focus(),
              )}
              {toolbarButton("Quote", Quote, () => bodyRef.current?.focus())}
              {toolbarButton("Align justify", AlignJustify, () =>
                bodyRef.current?.focus(),
              )}
              {toolbarButton("Strikethrough", Strikethrough, () => {
                bodyRef.current?.focus();
                document.execCommand("strikeThrough");
              })}
            </div>
          </div>

          {fileName && (
            <div className="ri-uploaded-file-row">
              <FileText size={17} />
              <div className="ri-uploaded-file-copy">
                <strong>{fileName}</strong>
                <span>
                  {parsing
                    ? "Reading recipient list…"
                    : `${
                        Array.isArray(parseResult?.valid)
                          ? parseResult.valid.length
                          : typeof parseResult?.valid === "number"
                            ? parseResult.valid
                            : detectedRecipients.length
                      } email addresses detected`}
                </span>
              </div>
              {!parsing && parseResult && (
                <CheckCircle size={16} className="ri-file-success" />
              )}
              {parsing && <Loader2 size={16} className="animate-spin" />}
              <button
                type="button"
                onClick={removeFile}
                aria-label="Remove recipient list"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {parseResult &&
            (parseResult.invalid > 0 || parseResult.duplicates > 0) && (
              <div className="ri-parse-summary">
                <span>
                  <CheckCircle size={14} /> {parseResult.valid} valid
                </span>
                {parseResult.invalid > 0 && (
                  <span className="has-warning">
                    <AlertCircle size={14} /> {parseResult.invalid} invalid
                  </span>
                )}
                {parseResult.duplicates > 0 && (
                  <span className="has-warning">
                    <AlertCircle size={14} /> {parseResult.duplicates}{" "}
                    duplicates
                  </span>
                )}
              </div>
            )}
        </div>
      </form>
    </div>
  );
}
