import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import type { ComercialCustomer, ComercialContacto } from '@/lib/comercial/types';
import { CONTACT_COLOR } from '@/lib/comercial/map-point';

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

function contacto(over: Partial<ComercialContacto>): ComercialContacto {
  return {
    id: 'k1', nombre: 'Lead', tipo: 'prospecto', sector: null, direccion: null, localidad: null,
    geoEstado: 'OK', latitud: 40.5, longitud: -3.6,
    ...over,
  } as ComercialContacto;
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

  it('pinta los contactos como capa distinta: rombo violeta (no círculo) y título "· Contacto"', async () => {
    const customers = [customer({ id: 'a', nombre: 'Ana' })];
    const contacts = [contacto({ id: 'k1', nombre: 'Lead Uno', sector: 'Hostelería' })];
    render(<MapaClientes customers={customers} contacts={contacts} modo="estado" />);
    await waitFor(() => expect(createdMarkers.length).toBe(2));
    const contactMarker = createdMarkers.find((m) => String(m.opts.title).includes('Contacto'));
    expect(contactMarker).toBeTruthy();
    expect(contactMarker!.opts.title).toContain('Lead Uno');
    expect(contactMarker!.opts.icon.fillColor).toBe(CONTACT_COLOR);
    // Distinto del círculo de cliente: usa un path SVG (rombo), no SymbolPath.CIRCLE (0).
    expect(typeof contactMarker!.opts.icon.path).toBe('string');
    const clientMarker = createdMarkers.find((m) => m.opts.title === 'Ana');
    expect(clientMarker!.opts.icon.path).toBe(0);
  });

  it('el click en un contacto dispara onSelectContact, no onSelect', async () => {
    const onSelect = vi.fn();
    const onSelectContact = vi.fn();
    render(<MapaClientes customers={[]} contacts={[contacto({ id: 'k9', nombre: 'Beta' })]}
      onSelect={onSelect} onSelectContact={onSelectContact} modo="estado" />);
    await waitFor(() => expect(createdMarkers.length).toBe(1));
    createdMarkers[0].listeners.click();
    expect(onSelectContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'k9' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('descarta contactos sin coordenadas o no OK', async () => {
    const contacts = [
      contacto({ id: 'k1', geoEstado: 'OK', latitud: 40.5, longitud: -3.6 }),
      contacto({ id: 'k2', geoEstado: 'PENDING', latitud: null, longitud: null }),
    ];
    render(<MapaClientes customers={[]} contacts={contacts} modo="estado" />);
    await waitFor(() => expect(createdMarkers.length).toBe(1));
  });

  it('sin API key muestra el aviso y no intenta cargar el mapa', async () => {
    mockKey.mockReturnValue(undefined);
    const { getByText } = render(<MapaClientes customers={[]} modo="estado" />);
    expect(getByText(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/)).toBeInTheDocument();
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
