'use client';

import { useState, useRef, useCallback } from 'react';
import { getAccessToken, getActiveBusinessId } from '@/lib/auth/session';
import { apiBaseUrl } from '@/lib/api/client';

export type BuildFormat = 'web-zip' | 'exe' | 'apk' | 'ipa';

export type ProgressEvent =
  | { type: 'format-start'; format: BuildFormat; index: number; total: number }
  | { type: 'progress'; format: BuildFormat; step: string; pct: number }
  | { type: 'format-done'; format: BuildFormat; outputPath: string }
  | { type: 'format-error'; format: BuildFormat; message: string }
  | { type: 'complete'; results: Array<{ format: BuildFormat; success: boolean; outputPath?: string; error?: string }> }
  | { type: 'fatal'; message: string };

export interface ExportRequest {
  projectId: string;
  formats: BuildFormat[];
  outputDir?: string;
}

interface UseExportStreamReturn {
  events: ProgressEvent[];
  isRunning: boolean;
  start: (req: ExportRequest) => void;
  reset: () => void;
}

export function useExportStream(): UseExportStreamReturn {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setEvents([]);
    setIsRunning(false);
  }, []);

  const start = useCallback((req: ExportRequest) => {
    // Abort any prior stream before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setEvents([]);
    setIsRunning(true);

    async function run() {
      try {
        const base = apiBaseUrl();
        if (!base) throw new Error('API no configurada');

        const t = await getAccessToken();
        const b = getActiveBusinessId();

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (t) headers['Authorization'] = `Bearer ${t}`;
        if (b) headers['x-business-id'] = b;

        const response = await fetch(`${base}/api/exports`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errBody?.error?.message ?? `Error ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line) as ProgressEvent;
                setEvents((prev) => [...prev, parsed]);
                if (parsed.type === 'complete' || parsed.type === 'fatal') {
                  setIsRunning(false);
                }
              } catch { /* skip malformed lines */ }
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        setEvents((prev) => [...prev, { type: 'fatal', message: msg }]);
      } finally {
        setIsRunning(false);
      }
    }

    void run();
  }, []);

  return { events, isRunning, start, reset };
}
