import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiBrandingSuggest } from '@/components/config/ai-branding-suggest';

// Mock de la capa IA: evita red y captura la descripción enviada.
const suggestMock = vi.fn();
vi.mock('@/lib/ai/usage-client', () => ({
  AiBlockedError: class AiBlockedError extends Error {},
  suggestBranding: (...a: unknown[]) => suggestMock(...a),
}));

const business = { name: 'Clínica X', vertical: 'dental' };

beforeEach(() => {
  suggestMock.mockReset();
  suggestMock.mockResolvedValue({ tokens: { palette: { primary: '#123456' } }, rationale: 'ok' });
});

describe('AiBrandingSuggest — dos botones', () => {
  it('sin landing: "Generar desde landing" está deshabilitado', () => {
    render(<AiBrandingSuggest business={business} current={{ primary: '#000', secondary: '#fff' }} onApply={() => {}} />);
    const btn = screen.getByRole('button', { name: /Generar desde landing/i });
    expect(btn).toBeDisabled();
    // El de prompt siempre disponible.
    expect(screen.getByRole('button', { name: /Generar prompt/i })).not.toBeDisabled();
  });

  it('con landing: el botón se habilita y envía los estilos REALES capturados', async () => {
    render(
      <AiBrandingSuggest
        business={business}
        current={{ primary: '#aa1133', secondary: '#22ddee', tokens: { palette: { primary: '#aa1133', secondary: '#22ddee' }, typography: { heading: 'Poppins' } } }}
        onApply={() => {}}
        landingSource="landing.zip"
      />
    );
    const btn = screen.getByRole('button', { name: /Generar desde landing/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(suggestMock).toHaveBeenCalledTimes(1));
    const arg = suggestMock.mock.calls[0][0] as { clientId: unknown; business: { description: string } };
    expect(arg.clientId).toBeNull(); // trabajo del operador, sin metering
    expect(arg.business.description).toContain('#aa1133'); // paleta capturada real
    expect(arg.business.description).toContain('Poppins'); // tipografía capturada
    expect(arg.business.description).toContain('landing.zip');
  });
});
