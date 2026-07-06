'use client';
import { useEffect, useRef, useState } from 'react';
import type { ComercialCustomer, ComercialContacto } from '@/lib/comercial/types';
import { markerColor, type ColorMode } from '@/lib/comercial/marker-color';
import { CONTACT_COLOR, CONTACT_STROKE, buildBoundsKey, isMappable } from '@/lib/comercial/map-point';
import { googleMapsApiKey, loadGoogleMaps } from '@/lib/maps/loader';

// Mapa comercial con Google Maps JS API. Imperativo (useRef) para reusar el mismo estilo
// que el resto del módulo. Pinta DOS capas de puntos con geoEstado=OK:
//  - Clientes (cartera): círculo relleno, color por `modo` (estado/gasto, §16.3).
//  - Contactos (leads/prospectos): rombo violeta neutro, forma distinta para que se lean
//    claramente como "otra cosa" (no tienen estado de visita ni categoría ABC).

interface Props {
  customers: ComercialCustomer[];
  contacts?: ComercialContacto[];
  selectedId?: string | null;
  onSelect?: (c: ComercialCustomer) => void;
  onSelectContact?: (c: ComercialContacto) => void;
  center?: { lat: number; lng: number };
  modo?: ColorMode;
}

const BOX_CLASS = 'h-[520px] w-full rounded-xl border border-white/10 z-0';

export default function MapaClientes({ customers, contacts = [], selectedId, onSelect, onSelectContact, center, modo = 'estado' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Clave del último conjunto de clientes sobre el que se hizo fitBounds: al
  // repintar por selectedId/modo (seleccionar en el mapa, cambiar color) NO hay
  // que reencuadrar de nuevo — eso pisaba el zoom/pan manual del usuario en
  // cada click. Solo se reencuadra cuando el conjunto de ubicados cambia.
  const boundsKeyRef = useRef<string | null>(null);

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

  // Re-pinta marcadores cuando el mapa está listo o cambian clientes, contactos, selección o modo.
  useEffect(() => {
    if (!ready) return;
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, customers, contacts, selectedId, modo]);

  function clearMarkers() {
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
  }

  function renderMarkers() {
    const map = mapRef.current;
    if (!map) return;
    clearMarkers();

    const located = customers.filter(isMappable);
    const locatedContacts = contacts.filter(isMappable);
    const bounds = new google.maps.LatLngBounds();

    // Capa 1: clientes de cartera (círculo relleno, color por estado/gasto).
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

    // Capa 2: contactos (leads/prospectos). Rombo violeta neutro — distinto en forma y color
    // del círculo de cliente. Sin estado/gasto: el color es fijo. El título aporta el nombre.
    for (const c of locatedContacts) {
      const position = { lat: c.latitud as number, lng: c.longitud as number };
      const marker = new google.maps.Marker({
        map,
        position,
        title: `${c.nombre} · Contacto${c.sector ? ` (${c.sector})` : ''}`,
        icon: {
          // Rombo (cuadrado rotado 45°): silueta claramente distinta del círculo de cliente.
          path: 'M 0 -7 L 7 0 L 0 7 L -7 0 Z',
          fillColor: CONTACT_COLOR,
          fillOpacity: 1,
          strokeColor: CONTACT_STROKE,
          strokeWeight: 2,
          scale: 1,
        },
      });
      marker.addListener('click', () => onSelectContact?.(c));
      markersRef.current.push(marker);
      bounds.extend(position);
    }

    // Clave de reencuadre: refleja el conjunto TOTAL (clientes + contactos), no cada selección.
    const boundsKey = buildBoundsKey(located.map((c) => c.id), locatedContacts.map((c) => c.id));
    const isNewSet = boundsKey !== boundsKeyRef.current;
    if (markersRef.current.length > 0 && !center && isNewSet) {
      boundsKeyRef.current = boundsKey;
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
