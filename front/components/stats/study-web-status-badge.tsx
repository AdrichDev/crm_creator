'use client';
import { Badge } from '@/components/ui/primitives';
import type { WebsiteStatus } from '@/lib/api/market-studies';

// Estado web de un prospecto (modelo AA). Reusa el primitive Badge del CRM.

const TONE: Record<WebsiteStatus, 'red' | 'amber' | 'green'> = {
  no_web: 'red',
  web_no_chatbot: 'amber',
  web_chatbot: 'green',
};

const LABEL: Record<WebsiteStatus, string> = {
  no_web: 'Sin web',
  web_no_chatbot: 'Web s/chatbot',
  web_chatbot: 'Web c/chatbot',
};

export function StudyWebStatusBadge({ status }: { status?: WebsiteStatus }) {
  if (!status) return <span className="text-[var(--panel-muted)]">—</span>;
  return <Badge tone={TONE[status] ?? 'gray'}>{LABEL[status] ?? status}</Badge>;
}
