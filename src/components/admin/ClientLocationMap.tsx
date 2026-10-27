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
          element.className = 'client-map-marker';
          element.setAttribute('aria-label', client.name);

          const popupContent = document.createElement('div');
          popupContent.className = 'client-map-popup';
          const name = document.createElement('strong');
          name.textContent = client.name;
          popupContent.append(name);
          if (client.city) {
            const city = document.createElement('span');
            city.textContent = client.city;
            popupContent.append(city);
          }
          if (client.address) {
            const address = document.createElement('span');
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
    return <p className="client-map-unconfigured" role="status">{t('loadingMap')}</p>;
  }

  if (configurationStatus !== 'ready') {
    return (
      <div className="client-map-unconfigured" role="status">
        <MapPinned size={20} aria-hidden="true" />
        <div>
          <strong>{t(configurationStatus === 'missing' ? 'mapboxTokenNeeded' : 'mapboxConfigurationError')}</strong>
          {configurationStatus === 'missing' && <p>{t('mapboxTokenInstructions')}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="client-map-frame">
      <div ref={containerRef} className="client-map-canvas" role="region" aria-label={t('clientStoreMap')} />
      {mapError && <p className="client-map-error" role="alert">{t('mapboxRenderError')}</p>}
    </div>
  );
}
