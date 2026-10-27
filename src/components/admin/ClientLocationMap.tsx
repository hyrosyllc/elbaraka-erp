'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { MapPinned } from 'lucide-react';
import { useLocale } from './LocaleContext';

import 'mapbox-gl/dist/mapbox-gl.css';

export type ClientMapLocation = {
  name: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
};

export function ClientLocationMap({ clients }: { clients: ClientMapLocation[] }) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [accessToken, setAccessToken] = useState('');
  const [configurationStatus, setConfigurationStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    let disposed = false;

    void fetch('/api/operations/mapbox-token', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { token?: string };
        if (!response.ok || !result.token?.startsWith('pk.')) {
          if (!disposed) setConfigurationStatus(response.status === 503 ? 'missing' : 'error');
          return;
        }
        if (!disposed) {
          setAccessToken(result.token);
          setConfigurationStatus('ready');
        }
      })
      .catch(() => {
        if (!disposed) setConfigurationStatus('error');
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!accessToken || !containerRef.current) return;

    let disposed = false;
    let map: MapboxMap | undefined;
    const markers: MapboxMarker[] = [];
    setMapError(false);

    void import('mapbox-gl')
      .then(({ default: mapboxgl }) => {
        if (disposed || !containerRef.current) return;

        const mapInstance = new mapboxgl.Map({
          accessToken,
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-7.5898, 33.5731],
          zoom: 5,
        });
        map = mapInstance;

        const bounds = new mapboxgl.LngLatBounds();
        clients.forEach((client) => {
          const element = document.createElement('button');
          element.type = 'button';
          element.className = 'size-4 rounded-full border-2 border-white bg-emerald-700 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2';
          element.setAttribute('aria-label', client.name);

          const popupContent = document.createElement('div');
          popupContent.className = 'grid min-w-32 gap-1 text-sm text-slate-800';
          const name = document.createElement('strong');
          name.className = 'font-semibold';
          name.textContent = client.name;
          popupContent.append(name);
          if (client.city) {
            const city = document.createElement('span');
            city.className = 'text-xs text-slate-600';
            city.textContent = client.city;
            popupContent.append(city);
          }
          if (client.address) {
            const address = document.createElement('span');
            address.className = 'text-xs text-slate-600';
            address.textContent = client.address;
            popupContent.append(address);
          }

          const marker = new mapboxgl.Marker({ element, anchor: 'bottom' })
            .setLngLat([client.longitude, client.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 18 }).setDOMContent(popupContent))
            .addTo(mapInstance);
          markers.push(marker);
          bounds.extend([client.longitude, client.latitude]);
        });

        map.on('error', () => setMapError(true));
        map.once('load', () => {
          if (bounds.isEmpty()) return;
          if (clients.length === 1) {
            const [longitude, latitude] = bounds.getCenter().toArray();
            map?.jumpTo({ center: [longitude, latitude], zoom: 11 });
          } else {
            map?.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 0 });
          }
        });
      })
      .catch(() => {
        if (!disposed) setMapError(true);
      });

    return () => {
      disposed = true;
      markers.forEach((marker) => marker.remove());
      map?.remove();
    };
  }, [accessToken, clients]);

  if (configurationStatus === 'loading') {
    return <p className="flex min-h-28 items-center justify-center rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground" role="status">{t('loadingMap')}</p>;
  }

  if (configurationStatus !== 'ready') {
    return (
      <div className="flex min-h-28 items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground" role="status">
        <MapPinned size={20} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="grid gap-1">
          <strong>{t(configurationStatus === 'missing' ? 'mapboxTokenNeeded' : 'mapboxConfigurationError')}</strong>
          {configurationStatus === 'missing' && <p className="m-0 text-muted-foreground">{t('mapboxTokenInstructions')}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-[min(60vh,32rem)] min-h-72 w-full" role="region" aria-label={t('clientStoreMap')} />
      {mapError && <p className="absolute inset-x-3 top-3 m-0 rounded-md border border-red-200 bg-red-50/95 p-3 text-sm text-red-900 shadow-sm" role="alert">{t('mapboxRenderError')}</p>}
    </div>
  );
}
