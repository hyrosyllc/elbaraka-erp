'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { MapPinned } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  URGENCY_COLORS,
  UNASSIGNED_COLOR,
  driverColors,
  type MapClient,
  type MapDriver,
  type Urgency,
} from '@/lib/delivery-map';
import { useLocale } from './LocaleContext';
import { ClientPanel, URGENCY_BADGE, URGENCY_LABEL_KEYS } from './ClientPanel';

import 'mapbox-gl/dist/mapbox-gl.css';

type ColorMode = 'urgency' | 'driver';
type MapData = { clients: MapClient[]; drivers: MapDriver[]; today: string; canManage: boolean };

const URGENCY_ORDER: Urgency[] = ['overdue', 'due_today', 'upcoming', 'awaiting', 'none'];

export function DeliveryMapPage() {
  const { t } = useLocale();
  const [data, setData] = useState<MapData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<ColorMode>('urgency');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/delivery-map', { cache: 'no-store' });
      if (!response.ok) throw new Error('load');
      setData(await response.json() as MapData);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const colors = useMemo(() => driverColors(data?.drivers ?? []), [data?.drivers]);
  const driverName = useCallback(
    (id: string | null) => (id ? data?.drivers.find((driver) => driver.userId === id)?.fullName ?? t('mapAssignedDriver') : t('mapUnassigned')),
    [data?.drivers, t],
  );

  const keyOf = useCallback((client: MapClient) => (mode === 'urgency' ? client.urgency : client.driverId ?? 'unassigned'), [mode]);
  const colorOf = useCallback(
    (client: MapClient) => (mode === 'urgency' ? URGENCY_COLORS[client.urgency] : (client.driverId && colors.get(client.driverId)) || UNASSIGNED_COLOR),
    [mode, colors],
  );

  const visible = useMemo(() => (data?.clients ?? []).filter((client) => !hiddenKeys.has(keyOf(client))), [data?.clients, hiddenKeys, keyOf]);
  const located = useMemo(() => visible.filter((client) => client.latitude !== null && client.longitude !== null), [visible]);
  const unlocated = useMemo(() => (data?.clients ?? []).filter((client) => client.latitude === null || client.longitude === null), [data?.clients]);
  const selected = data?.clients.find((client) => client.id === selectedId) ?? null;

  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const client of data?.clients ?? []) counts.set(keyOf(client), (counts.get(keyOf(client)) ?? 0) + 1);
    if (mode === 'urgency') {
      return URGENCY_ORDER.map((urgency) => ({ key: urgency, label: t(URGENCY_LABEL_KEYS[urgency]), color: URGENCY_COLORS[urgency], count: counts.get(urgency) ?? 0 }));
    }
    const items = (data?.drivers ?? []).map((driver) => ({ key: driver.userId, label: driver.fullName, color: colors.get(driver.userId) ?? UNASSIGNED_COLOR, count: counts.get(driver.userId) ?? 0 }));
    items.push({ key: 'unassigned', label: t('mapUnassigned'), color: UNASSIGNED_COLOR, count: counts.get('unassigned') ?? 0 });
    return items;
  }, [data, mode, colors, keyOf, t]);

  function toggleKey(key: string) {
    setHiddenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loadError) {
    return (
      <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">
        {t('mapLoadError')} <Button type="button" variant="link" onClick={() => void load()}>{t('retry')}</Button>
      </p>
    );
  }
  if (!data) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingMap')}</p>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5" role="group" aria-label={t('mapColorBy')}>
          {(['urgency', 'driver'] as ColorMode[]).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={mode === value ? 'primary' : 'ghost'}
              aria-pressed={mode === value}
              onClick={() => { setMode(value); setHiddenKeys(new Set()); }}
            >
              {t(value === 'urgency' ? 'mapByUrgency' : 'mapByDriver')}
            </Button>
          ))}
        </div>
        <ul className="m-0 flex flex-1 list-none flex-wrap gap-2 p-0">
          {legend.map((item) => (
            <li key={item.key}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-pressed={!hiddenKeys.has(item.key)}
                className={hiddenKeys.has(item.key) ? 'opacity-50' : undefined}
                onClick={() => toggleKey(item.key)}
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                {item.label} ({item.count})
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="grid gap-4">
          <MapCanvas clients={located} colorOf={colorOf} selectedId={selectedId} onSelect={setSelectedId} />
          <ClientList clients={visible} colorOf={colorOf} selectedId={selectedId} onSelect={setSelectedId} />
          {unlocated.length > 0 && (
            <section className="grid gap-2 rounded-lg border border-border bg-card p-4">
              <h2 className="m-0 text-sm font-bold text-foreground">{t('mapNotOnMap')} ({unlocated.length})</h2>
              <p className="m-0 text-caption text-subtle">{t('mapNotOnMapHint')}</p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {unlocated.map((client) => (
                  <li key={client.id}><Button type="button" variant="secondary" size="sm" onClick={() => setSelectedId(client.id)}>{client.name}</Button></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {selected
          ? <ClientPanel client={selected} drivers={data.canManage ? data.drivers : []} today={data.today} canManage={data.canManage} driverName={driverName} onClose={() => setSelectedId(null)} onChanged={() => void load()} />
          : <p className="m-0 rounded-lg border border-dashed border-border p-4 text-xs text-subtle">{t('mapSelectClient')}</p>}
      </div>
    </div>
  );
}

function ClientList({
  clients,
  colorOf,
  selectedId,
  onSelect,
}: {
  clients: MapClient[];
  colorOf: (client: MapClient) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useLocale();
  return (
    <section className="grid gap-2 rounded-lg border border-border bg-card p-4">
      <h2 className="m-0 text-sm font-bold text-foreground">{t('mapListView')} ({clients.length})</h2>
      <ul className="m-0 grid max-h-80 list-none gap-1 overflow-y-auto p-0">
        {clients.map((client) => (
          <li key={client.id}>
            <Button
              type="button"
              variant={client.id === selectedId ? 'secondary' : 'ghost'}
              aria-pressed={client.id === selectedId}
              className="h-auto w-full justify-start gap-2.5 py-2 text-start"
              onClick={() => onSelect(client.id)}
            >
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colorOf(client) }} aria-hidden="true" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <strong className="truncate text-xs text-foreground">{client.name}</strong>
                <small className="truncate text-caption text-subtle">{client.city || client.address}</small>
              </span>
              <Badge variant={URGENCY_BADGE[client.urgency]}>{t(URGENCY_LABEL_KEYS[client.urgency])}</Badge>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MapCanvas({
  clients,
  colorOf,
  selectedId,
  onSelect,
}: {
  clients: MapClient[];
  colorOf: (client: MapClient) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, { marker: MapboxMarker; element: HTMLButtonElement }>>(new Map());
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let disposed = false;
    void fetch('/api/operations/mapbox-token', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { token?: string };
        if (disposed) return;
        if (!response.ok || !result.token?.startsWith('pk.')) {
          setStatus(response.status === 503 ? 'missing' : 'error');
          return;
        }
        setToken(result.token);
        setStatus('ready');
      })
      .catch(() => {
        if (!disposed) setStatus('error');
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!token || !containerRef.current) return;
    let disposed = false;
    const markers = markersRef.current;
    void import('mapbox-gl')
      .then(({ default: mapboxgl }) => {
        if (disposed || !containerRef.current) return;
        const map = new mapboxgl.Map({
          accessToken: token,
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-7.5898, 33.5731],
          zoom: 5,
        });
        map.on('error', () => setMapError(true));
        map.once('load', () => setMapReady(true));
        mapRef.current = map;
      })
      .catch(() => {
        if (!disposed) setMapError(true);
      });
    return () => {
      disposed = true;
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let disposed = false;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (disposed) return;
      const markers = markersRef.current;
      const wanted = new Set(clients.map((client) => client.id));
      for (const [id, entry] of markers) {
        if (!wanted.has(id)) {
          entry.marker.remove();
          markers.delete(id);
        }
      }
      for (const client of clients) {
        if (client.latitude === null || client.longitude === null) continue;
        let entry = markers.get(client.id);
        if (!entry) {
          const element = document.createElement('button');
          element.type = 'button';
          element.className = 'size-5 rounded-full border-2 border-white shadow-md transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
          element.addEventListener('click', () => onSelectRef.current(client.id));
          const marker = new mapboxgl.Marker({ element }).setLngLat([client.longitude, client.latitude]).addTo(map);
          entry = { marker, element };
          markers.set(client.id, entry);
        }
        entry.element.setAttribute('aria-label', client.name);
        entry.element.title = client.name;
      }
      if (!fittedRef.current && clients.length > 0) {
        fittedRef.current = true;
        const bounds = new mapboxgl.LngLatBounds();
        clients.forEach((client) => bounds.extend([client.longitude as number, client.latitude as number]));
        if (clients.length === 1) map.jumpTo({ center: bounds.getCenter(), zoom: 11 });
        else map.fitBounds(bounds, { padding: 56, maxZoom: 11, duration: 0 });
      }
    });
    return () => {
      disposed = true;
    };
  }, [clients, mapReady]);

  useEffect(() => {
    for (const client of clients) {
      const entry = markersRef.current.get(client.id);
      if (!entry) continue;
      entry.element.style.backgroundColor = colorOf(client);
      const isSelected = client.id === selectedId;
      entry.element.style.transform = isSelected ? 'scale(1.5)' : '';
      entry.element.style.zIndex = isSelected ? '2' : '';
    }
  }, [clients, colorOf, selectedId, mapReady]);

  useEffect(() => {
    const client = clients.find((candidate) => candidate.id === selectedId);
    if (client && mapReady && client.latitude !== null && client.longitude !== null) {
      mapRef.current?.easeTo({ center: [client.longitude, client.latitude], duration: 500 });
    }
    // Re-centre only when the selection changes, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, mapReady]);

  if (status === 'loading') return <p className="flex min-h-28 items-center justify-center rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground" role="status">{t('loadingMap')}</p>;
  if (status !== 'ready') {
    return (
      <div className="flex min-h-28 items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground" role="status">
        <MapPinned size={20} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="grid gap-1">
          <strong>{t(status === 'missing' ? 'mapboxTokenNeeded' : 'mapboxConfigurationError')}</strong>
          {status === 'missing' && <p className="m-0 text-muted-foreground">{t('mapboxTokenInstructions')}</p>}
          <p className="m-0 text-muted-foreground">{t('mapFallbackList')}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-[min(62vh,36rem)] min-h-80 w-full" role="region" aria-label={t('clientStoreMap')} />
      {mapError && <p className="absolute inset-x-3 top-3 m-0 rounded-md border border-destructive bg-destructive-soft p-3 text-sm text-destructive shadow-sm" role="alert">{t('mapboxRenderError')}</p>}
    </div>
  );
}
