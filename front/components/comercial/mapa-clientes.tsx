'use client';
import { useEffect, useRef, useState } from 'react';
import type { ComercialCustomer } from '@/lib/comercial/types';
import { markerColor, type ColorMode } from '@/lib/comercial/marker-color';
import { googleMapsApiKey, loadGoogleMaps } from '@/lib/maps/loader';

// Mapa de clientes con Google Maps JS API. Imperativo (useRef) para reusar el mismo estilo
// que el resto del módulo. Sólo pinta clientes con coordenadas válidas (geoEstado=OK).
// El color del marcador depende del `modo` (selector exclusivo estado/gasto, §16.3).

interface Props {
  customers: ComercialCustomer[];
  selectedId?: string | null;
  onSelect?: (c: ComercialCustomer) => void;
  center?: { lat: number; lng: number };
  modo?: ColorMode;
}

const BOX_CLASS = 'h-[520px] w-full rounded-xl border border-white/10 z-0';

export default function MapaClientes({ customers, selectedId, onSelect, center, modo = 'estado' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializa el mapa una vez.
  useEffect(() => {
    let cancelled = false;
    if (!googleMapsApiKey()) {
      setError('Mapa no disponible: falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
      return;
    }
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: center?.lat ?? 40.4168, lng: center?.lng ?? -3.7038 },
          zoom: center ? 13 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar Google Maps.');
      });
    return () => {
      cancelled = true;
      clearMarkers();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-pinta marcadores cuando el mapa está listo o cambian clientes, selección o modo de color.
  useEffect(() => {
    if (!ready) return;
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, customers, selectedId, modo]);

  function clearMarkers() {
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
  }

  function renderMarkers() {
    const map = mapRef.current;
    if (!map) return;
    clearMarkers();

    const located = customers.filter((c) => c.geoEstado === 'OK' && c.latitud != null && c.longitud != null);
    const bounds = new google.maps.LatLngBounds();
    for (const c of located) {
      const color = markerColor(c, modo);
      const selected = c.id === selectedId;
      const position = { lat: c.latitud as number, lng: c.longitud as number };
      const marker = new google.maps.Marker({
        map,
        position,
        title: `${c.nombre}${c.categoriaAbc ? ` · ${c.categoriaAbc}` : ''}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: selected ? 9 : 6,
        },
        zIndex: selected ? 1000 : undefined,
      });
      marker.addListener('click', () => onSelect?.(c));
      markersRef.current.push(marker);
      bounds.extend(position);
    }

    if (markersRef.current.length > 0 && !center) {
      map.fitBounds(bounds, 48);
      // fitBounds puede acercar demasiado con un único punto: limita el zoom tras encajar.
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > 14) map.setZoom(14);
      });
    }
  }

  if (error) {
    return (
      <div className={`${BOX_CLASS} flex items-center justify-center bg-black/20 px-4 text-center text-sm text-[var(--panel-muted)]`}>
        {error}
      </div>
    );
  }

  return <div ref={containerRef} className={BOX_CLASS} />;
}
