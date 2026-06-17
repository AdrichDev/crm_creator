'use client';
import { Badge } from '@/components/ui/primitives';
import {
  PROSPECT_STATUS_LABELS, WEBSITE_STATUS_LABELS,
  type ProspectStatus, type WebsiteStatus,
} from '@/lib/stats/study-types';

// Insignias de estado de prospecto y de web, reutilizando el primitive Badge
// del CRM (tonos del tema claro/oscuro vía tokens).

const STATUS_TONE: Record<ProspectStatus, 'brand' | 'blue' | 'gray'> = {
  new: 'brand',
  contacted: 'blue',
  discarded: 'gray',
};

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{PROSPECT_STATUS_LABELS[status] ?? status}</Badge>;
}

const WEB_TONE: Record<WebsiteStatus, 'red' | 'amber' | 'green'> = {
  no_web: 'red',
  web_no_chatbot: 'amber',
  web_chatbot: 'green',
};

export function WebStatusBadge({ status }: { status?: WebsiteStatus }) {
  if (!status) return <span className="text-[var(--panel-muted)]">—</span>;
  return <Badge tone={WEB_TONE[status] ?? 'gray'}>{WEBSITE_STATUS_LABELS[status] ?? status}</Badge>;
}
