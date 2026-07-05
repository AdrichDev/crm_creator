import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import type { ComercialCustomer } from '@/lib/comercial/types';

// Controla el loader sin cargar la API real (imposible en jsdom).
const { mockKey, mockLoad } = vi.hoisted(() => ({
  mockKey: vi.fn<() => string | undefined>(() => 'test-key'),
  mockLoad: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('@/lib/maps/loader', () => ({
  googleMapsApiKey: mockKey,
  loadGoogleMaps: mockLoad,
}));

import MapaClientes from '@/components/comercial/mapa-clientes';

interface FakeMarker {
  opts: any;
  listeners: Record<string, () => void>;
}

const createdMarkers: FakeMarker[] = [];

class MockMarker {
  opts: any;
  listeners: Record<string, () => void> = {};
  constructor(opts: any) {
    this.opts = opts;
    createdMarkers.push(this);
  }
  addListener(ev: string, cb: () => void) {
    this.listeners[ev] = cb;
  }
  setMap() {}
}

class MockMap {
  private zoom: number;
  constructor(_el: unknown, opts: any) {
    this.zoom = opts?.zoom ?? 6;
  }
  fitBounds() {}
  getZoom() {
    return this.zoom;
  }
  setZoom(z: number) {
    this.zoom = z;
  }
}

class MockBounds {
  points: unknown[] = [];
  extend(p: unknown) {
    this.points.push(p);
  }
}

function installGoogleStub() {
  (globalThis as any).google = {
    maps: {
      Map: MockMap,
      Marker: MockMarker,
      LatLngBounds: MockBounds,
      SymbolPath: { CIRCLE: 0 },
      event: { addListenerOnce: (_m: unknown, _ev: string, cb: () => void) => cb() },
    },
  };
}

function customer(over: Partial<ComercialCustomer>): ComercialCustomer {
  return {
    id: 'c1',
    nombre: 'Cliente',
    geoEstado: 'OK',
    latitud: 40.4,
    longitud: -3.7,
    estadoVisita: { id: 's1', nombre: 'Pendiente', color: '#ef4444', icono: 'MapPin', esPendiente: true },
    ...over,
  } as ComercialCustomer;
}

beforeEach(() => {
  createdMarkers.length = 0;
  mockKey.mockClear();
  mockLoad.mockClear();
  mockKey.mockReturnValue('test-key');
  mockLoad.mockResolvedValue(undefined);
  installGoogleStub();
});

afterEach(() => {
  cleanup();
  delete (globalThis as any).google;
});

describe('MapaClientes — Google Maps JS API', () => {
  it('pinta un marcador por cliente geolocalizado (OK + lat/lng) y descarta el resto', async () => {
    const customers = [
      customer({ id: 'a', nombre: 'Ana', latitud: 40.4, longitud: -3.7 }),
      customer({ id: 'b', nombre: 'Beto', latitud: 41.4, longitud: -3.6 }),
      customer({ id: 'c', nombre: 'Sin geo', geoEstado: 'PENDING', latitud: null, longitud: null }),
    ];
    render(<MapaClientes customers={customers} modo="estado" />);
    await waitFor(() => expect(createdMarkers.length).toBe(2));
    expect(createdMarkers.map((m) => m.opts.title)).toEqual(['Ana', 'Beto']);
  });

  it('aplica el color de markerColor y agranda el marcador seleccionado', async () => {
    const customers = [
      customer({ id: 'a', nombre: 'Ana', estadoVisita: { id: 's', nombre: 'x', color: '#123456', icono: 'MapPin', esPendiente: true } }),
    ];
    render(<MapaClientes customers={customers} selectedId="a" modo="estado" />);
    await waitFor(() => expect(createdMarkers.length).toBe(1));
    expect(createdMarkers[0].opts.icon.fillColor).toBe('#123456');
    expect(createdMarkers[0].opts.icon.scale).toBe(9);
  });

  it('el click en un marcador dispara onSelect con el cliente', async () => {
    const onSelect = vi.fn();
    const customers = [customer({ id: 'a', nombre: 'Ana' })];
    render(<MapaClientes customers={customers} onSelect={onSelect} modo="estado" />);
    await waitFor(() => expect(createdMarkers.length).toBe(1));
    createdMarkers[0].listeners.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('sin API key muestra el aviso y no intenta cargar el mapa', async () => {
    mockKey.mockReturnValue(undefined);
    const { getByText } = render(<MapaClientes customers={[]} modo="estado" />);
    expect(getByText(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/)).toBeInTheDocument();
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
