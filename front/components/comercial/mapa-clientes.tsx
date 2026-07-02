'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type * as L from 'leaflet';
import type { ComercialCustomer } from '@/lib/comercial/types';
import { markerColor, type ColorMode } from '@/lib/comercial/marker-color';

// Mapa de clientes con Leaflet + OpenStreetMap (gratis, sin API key). Imperativo con
// import dinámico (evita SSR). Sólo pinta clientes con coordenadas válidas (geoEstado=OK).
// El color del marcador depende del `modo` (selector exclusivo estado/gasto, §16.3).

interface Props {
  customers: ComercialCustomer[];
  selectedId?: string | null;
  onSelect?: (c: ComercialCustomer) => void;
  center?: { lat: number; lng: number };
  modo?: ColorMode;
}

export default function MapaClientes({ customers, selectedId, onSelect, center, modo = 'estado' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const LRef = useRef<typeof L | null>(null);

  // Inicializa el mapa una vez.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = (await import('leaflet')).default ?? (await import('leaflet'));
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = leaflet as unknown as typeof L;
      const map = leaflet.map(containerRef.current, { zoomControl: true }).setView(
        [center?.lat ?? 40.4168, center?.lng ?? -3.7038],
        center ? 13 : 6,
      );
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      renderMarkers();
    })();
    return () => {
      cancelled = true;
      // Destruye el mapa al desmontar: evita el error "Map container is already
      // initialized" al volver a la ruta y libera listeners/tiles.
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-pinta marcadores cuando cambian los clientes, la selección o el modo de color.
  useEffect(() => {
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, selectedId, modo]);

  function renderMarkers() {
    const leaflet = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!leaflet || !map || !layer) return;
    layer.clearLayers();

    const located = customers.filter((c) => c.geoEstado === 'OK' && c.latitud != null && c.longitud != null);
    const pts: [number, number][] = [];
    for (const c of located) {
      const color = markerColor(c, modo);
      const selected = c.id === selectedId;
      const icon = leaflet.divIcon({
        className: 'comercial-marker',
        html: `<span style="display:block;width:${selected ? 20 : 14}px;height:${selected ? 20 : 14}px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${color}55"></span>`,
        iconSize: [selected ? 20 : 14, selected ? 20 : 14],
        iconAnchor: [selected ? 10 : 7, selected ? 10 : 7],
      });
      const m = leaflet.marker([c.latitud as number, c.longitud as number], { icon, title: c.nombre });
      m.on('click', () => onSelect?.(c));
      m.bindTooltip(`${c.nombre}${c.categoriaAbc ? ` · ${c.categoriaAbc}` : ''}`, { direction: 'top' });
      m.addTo(layer);
      pts.push([c.latitud as number, c.longitud as number]);
    }

    if (pts.length > 0 && !center) {
      map.fitBounds(leaflet.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
    }
  }

  return <div ref={containerRef} className="h-[520px] w-full rounded-xl border border-white/10 z-0" />;
}
