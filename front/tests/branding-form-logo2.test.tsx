import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrandingForm } from '@/components/config/branding-form';

// "Imagen de marca 2" (paso 3): campo INDEPENDIENTE de la imagen de marca del paso 2,
// destinado a la cabecera de los documentos imprimibles. Verifica que el campo se emite
// por separado (logoImage2) y que el indicador de pasos refleja su estado.

afterEach(() => cleanup());

const base = { primary: '#123456', secondary: '#abcdef', logoText: 'AB' };

describe('BrandingForm — Imagen de marca 2 (cabecera de documentos)', () => {
  it('sin logoImage2 muestra la pista de fallback a la imagen de marca del paso 2', () => {
    render(<BrandingForm {...base} logoImage="data:image/png;base64,AAA" onChange={vi.fn()} />);
    expect(screen.getByText(/usa la imagen de marca del paso 2/i)).toBeInTheDocument();
  });

  it('"Quitar imagen" del paso 3 emite logoImage2: undefined sin tocar logoImage', () => {
    const onChange = vi.fn();
    render(<BrandingForm {...base} logoImage="IMG1" logoImage2="IMG2" onChange={onChange} />);
    // Dos botones "Quitar imagen": paso 2 (logoImage) y paso 3 (logoImage2). El del paso 3 es el segundo.
    const quitar = screen.getAllByText('Quitar imagen');
    expect(quitar).toHaveLength(2);
    fireEvent.click(quitar[1]);
    expect(onChange).toHaveBeenCalledWith({ logoImage2: undefined });
  });

  it('subir un archivo al paso 3 emite SOLO logoImage2 (no logoImage)', async () => {
    const onChange = vi.fn();
    const { container } = render(<BrandingForm {...base} logoImage="IMG1" onChange={onChange} />);
    // Inputs de imagen: [0] = imagen de marca (paso 2), [1] = imagen de marca 2 (paso 3).
    const imageInputs = container.querySelectorAll('input[type="file"][accept="image/*"]');
    expect(imageInputs).toHaveLength(2);
    const file = new File(['x'], 'header.png', { type: 'image/png' });
    fireEvent.change(imageInputs[1], { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const patch = onChange.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(['logoImage2']);
    expect(String(patch.logoImage2)).toMatch(/^data:/);
  });

  it('el indicador de pasos marca el paso 3 como hecho solo cuando hay logoImage2', () => {
    const { rerender } = render(<BrandingForm {...base} onChange={vi.fn()} />);
    // getAllByText[0] = etiqueta del indicador de pasos (aparece antes que el título StepHead).
    expect(screen.getAllByText('Imagen de marca 2')[0].className).toContain('text-gray-400');
    rerender(<BrandingForm {...base} logoImage2="IMG2" onChange={vi.fn()} />);
    expect(screen.getAllByText('Imagen de marca 2')[0].className).toContain('text-gray-800');
  });
});
