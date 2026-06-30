import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { SearchInput } from '@/components/ui/search-input';

afterEach(() => cleanup());

describe('UC · SearchInput — debounce 300 ms', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no llama a onChange antes de 300 ms', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'm' } });
    fireEvent.change(input, { target: { value: 'ma' } });
    fireEvent.change(input, { target: { value: 'mar' } });

    act(() => { vi.advanceTimersByTime(299); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('llama a onChange exactamente una vez tras 300 ms con el valor final', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'm' } });
    fireEvent.change(input, { target: { value: 'ma' } });
    fireEvent.change(input, { target: { value: 'mar' } });

    act(() => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('mar');
  });

  it('resetea el timer en cada keystroke', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'm' } });
    act(() => { vi.advanceTimersByTime(200); }); // 200ms tras 'm'
    fireEvent.change(input, { target: { value: 'ma' } });
    act(() => { vi.advanceTimersByTime(200); }); // solo 200ms tras 'ma'

    // No debe haber llamado aún (300ms no cumplidos desde 'ma')
    expect(onChange).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(100); }); // ahora 300ms tras 'ma'
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ma');
  });
});
