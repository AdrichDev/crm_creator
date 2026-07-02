// Unit tests for lib/api/calendar.ts — crm-citas-google-calendar (WU4.1).
// Mocks apiFetch/apiBaseUrl so no live network or real backend is needed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiBaseUrl: () => 'http://localhost:4001',
  isApiEnabled: () => true,
}));

import {
  getCalendarStatus,
  generateCalendarToken,
  revokeCalendarToken,
  updateCalendarPushEnabled,
  calendarFeedUrl,
} from '@/lib/api/calendar';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('getCalendarStatus', () => {
  it('calls GET /calendar/status', async () => {
    mockApiFetch.mockResolvedValue({ hasToken: true, pushEnabled: false });
    const result = await getCalendarStatus();
    expect(mockApiFetch).toHaveBeenCalledWith('/calendar/status');
    expect(result).toEqual({ hasToken: true, pushEnabled: false });
  });
});

describe('generateCalendarToken', () => {
  it('calls POST /calendar/token y devuelve el token en claro (una sola vez)', async () => {
    mockApiFetch.mockResolvedValue({ token: 'abc123', path: '/calendar/feed/abc123.ics', regenerated: false });
    const result = await generateCalendarToken();
    expect(mockApiFetch).toHaveBeenCalledWith('/calendar/token', expect.objectContaining({ method: 'POST' }));
    expect(result.token).toBe('abc123');
    expect(result.path).toBe('/calendar/feed/abc123.ics');
  });
});

describe('revokeCalendarToken', () => {
  it('calls DELETE /calendar/token', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await revokeCalendarToken();
    expect(mockApiFetch).toHaveBeenCalledWith('/calendar/token', expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('updateCalendarPushEnabled', () => {
  it('calls PATCH /calendar/preferences con { pushEnabled }', async () => {
    mockApiFetch.mockResolvedValue({ pushEnabled: true });
    const result = await updateCalendarPushEnabled(true);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/calendar/preferences',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ pushEnabled: true }) }),
    );
    expect(result).toEqual({ pushEnabled: true });
  });
});

describe('calendarFeedUrl', () => {
  it('antepone apiBaseUrl() + /api al path relativo', () => {
    expect(calendarFeedUrl('/calendar/feed/abc123.ics')).toBe('http://localhost:4001/api/calendar/feed/abc123.ics');
  });
});
