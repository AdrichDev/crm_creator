import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { ModelEffort } from '@/components/ai/model-effort';
import { LLM_PROVIDERS } from '@/lib/config/models';

afterEach(() => cleanup());

const noop = () => {};

function selects(container: HTMLElement) {
  const [modelSel, effortSel] = Array.from(container.querySelectorAll('select'));
  return { modelSel, effortSel };
}

describe('UC · ModelEffort (componente unificado)', () => {
  for (const variant of ['opera', 'config'] as const) {
    it(`variant='${variant}' pinta optgroups de LLM_PROVIDERS`, () => {
      const { container } = render(
        <ModelEffort variant={variant} model="gpt-5.4" effort="medium" onModel={noop} onEffort={noop} />,
      );
      const { modelSel } = selects(container);
      const optgroups = modelSel.querySelectorAll('optgroup');
      expect(optgroups.length).toBe(LLM_PROVIDERS.length);
      LLM_PROVIDERS.forEach((p, i) => {
        expect(optgroups[i].getAttribute('label')).toBe(p.label);
        expect(within(optgroups[i] as unknown as HTMLElement).getAllByRole('option').length).toBe(p.models.length);
      });
    });

    it(`variant='${variant}' habilita effort si el modelo lo soporta (gpt-5*)`, () => {
      const { container } = render(
        <ModelEffort variant={variant} model="gpt-5.4" effort="medium" onModel={noop} onEffort={noop} />,
      );
      expect(selects(container).effortSel.disabled).toBe(false);
    });

    it(`variant='${variant}' deshabilita effort si el modelo NO lo soporta`, () => {
      const { container } = render(
        <ModelEffort variant={variant} model="gemini-2.5-pro" effort="none" onModel={noop} onEffort={noop} />,
      );
      expect(selects(container).effortSel.disabled).toBe(true);
    });
  }

  it('aplica clases opera-* en variant opera y grises en config', () => {
    const { container: opera } = render(
      <ModelEffort variant="opera" model="gpt-5.4" effort="medium" onModel={noop} onEffort={noop} />,
    );
    expect(opera.querySelector('.opera-control')).not.toBeNull();

    const { container: config } = render(
      <ModelEffort variant="config" model="gpt-5.4" effort="medium" onModel={noop} onEffort={noop} />,
    );
    expect(config.querySelector('.opera-control')).toBeNull();
    expect(config.querySelector('select')?.className).toContain('border-gray-300');
  });
});
