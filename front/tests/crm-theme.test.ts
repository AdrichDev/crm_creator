import { describe, it, expect } from 'vitest';
import { resolveMode } from '@/lib/theme/crm-theme';

describe('UC-8 · resolución de tema CRM', () => {
  it('AC-8.1 system sigue la preferencia del SO', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
  });
  it('AC-8.2 override manual gana sobre el SO', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });
});
