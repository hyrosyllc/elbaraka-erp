'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import Supercluster from 'supercluster';
import { Box, ChevronDown, ChevronUp, List, Crosshair, Locate, MapPin, MapPinned, Navigation, Phone, Search, Square, Store, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
type Place = { label: string; latitude: number; longitude: number };
type Coords = { latitude: number; longitude: number };
type FlyTarget = Coords & { n: number; zoom?: number };
type MapData = { clients: MapClient[]; drivers: MapDriver[]; today: string; canManage: boolean };

const URGENCY_ORDER: Urgency[] = ['overdue', 'due_today', 'upcoming', 'awaiting', 'none'];
const hasCoords = (client: MapClient): client is MapClient & { latitude: number; longitude: number } => client.latitude !== null && client.longitude !== null;

export function DeliveryMapPage() {
  const { t } = useLocale();
  const [data, setData] = useState<MapData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<ColorMode>('urgency');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [is3d, setIs3d] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, setPending] = useState<Coords | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [userLocation, setUserLocation] = useState<(Coords & { accuracy: number }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState('');

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
  // The store being repositioned is represented by the centre pin, not by a marker.
  const located = useMemo(() => visible.filter((client) => hasCoords(client) && client.id !== editId), [visible, editId]);
  const unlocated = useMemo(() => (data?.clients ?? []).filter((client) => !hasCoords(client)), [data?.clients]);
  const selected = data?.clients.find((client) => client.id === selectedId) ?? null;

  const needle = query.trim().toLowerCase();
  const storeMatches = useMemo(
    () => (needle ? (data?.clients ?? []).filter((client) => [client.name, client.city, client.address, client.phone, client.contactName].some((value) => value.toLowerCase().includes(needle))).slice(0, 6) : []),
    [data?.clients, needle],
  );

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

  const selectClient = useCallback((id: string | null) => {
    setSelectedId(id);
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) {
      setPlaces([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/operations/geocode?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store', signal: controller.signal })
        .then((response) => (response.ok ? response.json() as Promise<{ results: Place[] }> : { results: [] }))
        .then((result) => setPlaces(result.results))
        .catch(() => undefined);
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function closeSearch() {
    setQuery('');
    setSearchFocused(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function pickStore(client: MapClient) {
    selectClient(client.id);
    if (hasCoords(client)) setFlyTo({ latitude: client.latitude, longitude: client.longitude, zoom: 15, n: Date.now() });
    closeSearch();
  }

  function pickPlace(place: Place) {
    setFlyTo({ latitude: place.latitude, longitude: place.longitude, zoom: 16, n: Date.now() });
    closeSearch();
  }

  function locateMe(afterFix?: (coords: Coords) => void) {
    if (!navigator.geolocation) {
      setGpsError(t('mapLocationUnavailable'));
      return;
    }
    setLocating(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserLocation({ ...coords, accuracy: position.coords.accuracy });
        setFlyTo({ ...coords, zoom: 17, n: Date.now() });
        afterFix?.(coords);
        setLocating(false);
      },
      (error) => {
        setGpsError(t(error.code === error.PERMISSION_DENIED ? 'mapLocationDenied' : 'mapLocationUnavailable'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }

  function applyCoords(coords: Coords) {
    setPending(coords);
    setFlyTo({ ...coords, zoom: 17, n: Date.now() });
  }

  function startEditing(client: MapClient) {
    setEditId(client.id);
    setLocationError('');
    if (hasCoords(client)) {
      setPending({ latitude: client.latitude, longitude: client.longitude });
      setFlyTo({ latitude: client.latitude, longitude: client.longitude, zoom: 17, n: Date.now() });
    } else {
      setPending(null);
    }
  }

  function stopEditing() {
    setEditId(null);
    setPending(null);
    setLocationError('');
  }

  async function saveLocation() {
    if (!editId || !pending) return;
    setSavingLocation(true);
    setLocationError('');
    try {
      const response = await fetch('/api/operations/delivery-map', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, ...pending }),
      });
      if (!response.ok) throw new Error('save');
      stopEditing();
      await load();
    } catch {
      setLocationError(t('mapLocationSaveError'));
    } finally {
      setSavingLocation(false);
    }
  }

  if (loadError) {
    return (
      <p className="m-4 rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">
        {t('mapLoadError')} <Button type="button" variant="link" onClick={() => void load()}>{t('retry')}</Button>
      </p>
    );
  }
  if (!data) return <p className="m-4 rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingMap')}</p>;

  const searchOpen = searchFocused && needle.length > 0;
  const editingClient = editId ? data.clients.find((client) => client.id === editId) ?? null : null;

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      <MapCanvas clients={located} colorOf={colorOf} selectedId={selectedId} onSelect={selectClient} is3d={is3d} fitSignal={fitSignal} flyTo={flyTo} editId={editId} hasPending={pending !== null} userLocation={userLocation} onCenter={(latitude, longitude) => setPending({ latitude, longitude })} />

      {editingClient && (
        <>
          <MapPin size={42} strokeWidth={1.5} className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-full fill-primary text-white drop-shadow-lg" aria-hidden="true" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 z-[2] size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/70" aria-hidden="true" />
        </>
      )}

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[3] flex flex-col gap-2 max-[760px]:me-16 min-[761px]:inset-x-auto min-[761px]:left-1/2 min-[761px]:w-[max(20rem,min(560px,calc(100%-50rem)))] min-[761px]:-translate-x-1/2">
        <div
          className="pointer-events-auto relative"
          onFocus={() => setSearchFocused(true)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false); }}
        >
          <div className="relative rounded-xl bg-card shadow-popover">
            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') closeSearch(); }}
              placeholder={t('mapSearchPlaceholder')}
              aria-label={t('mapSearchPlaceholder')}
              className="h-11 rounded-xl border-transparent ps-10 pe-10 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <Button type="button" variant="ghost" size="icon" className="absolute end-1 top-1/2 size-8 -translate-y-1/2" aria-label={t('close')} onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery('')}><X size={15} /></Button>
            )}
          </div>
          {searchOpen && (
            <div className="absolute inset-x-0 top-full z-10 mt-1.5 grid max-h-[min(60vh,26rem)] gap-1 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-popover" onMouseDown={(event) => event.preventDefault()}>
              {storeMatches.length > 0 && (
                <SearchGroup label={t('mapStores')}>
                  {storeMatches.map((client) => (
                    <SearchRow key={client.id} icon={<span className="size-3 rounded-full" style={{ backgroundColor: colorOf(client) }} aria-hidden="true" />} title={client.name} subtitle={[client.city, hasCoords(client) ? '' : t('mapNoLocation')].filter(Boolean).join(' · ')} onClick={() => pickStore(client)} />
                  ))}
                </SearchGroup>
              )}
              {places.length > 0 && (
                <SearchGroup label={t('mapPlaces')}>
                  {places.map((place) => (
                    <SearchRow key={`${place.latitude},${place.longitude}`} icon={<MapPin size={14} className="text-primary" aria-hidden="true" />} title={place.label} onClick={() => pickPlace(place)} />
                  ))}
                </SearchGroup>
              )}
              {storeMatches.length === 0 && places.length === 0 && <p className="m-0 p-3 text-xs text-subtle">{t('mapNoResults')}</p>}
            </div>
          )}
        </div>

        {!editingClient && (
          <div className={`pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] ${selected ? 'max-[760px]:hidden' : ''}`} role="group" aria-label={t('mapColorBy')}>
            <div className="inline-flex shrink-0 rounded-full border border-border bg-card p-0.5 shadow-sm">
              {(['urgency', 'driver'] as ColorMode[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={mode === value ? 'primary' : 'ghost'}
                  className="min-h-8 rounded-full px-3"
                  aria-pressed={mode === value}
                  onClick={() => { setMode(value); setHiddenKeys(new Set()); }}
                >
                  {t(value === 'urgency' ? 'mapByUrgency' : 'mapByDriver')}
                </Button>
              ))}
            </div>
            {legend.map((item) => (
              <Button
                key={item.key}
                type="button"
                variant="secondary"
                size="sm"
                aria-pressed={!hiddenKeys.has(item.key)}
                className={`min-h-8 shrink-0 gap-1.5 rounded-full bg-card px-3 shadow-sm ${hiddenKeys.has(item.key) ? 'opacity-50' : ''}`}
                onClick={() => toggleKey(item.key)}
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                {item.label} <span className="text-subtle">{item.count}</span>
              </Button>
            ))}
          </div>
        )}

      </div>

      {listOpen && !editingClient && (
        <div className="absolute start-16 top-3 z-[1] flex max-h-[calc(100%-1.5rem)] w-[320px] flex-col gap-2 overflow-y-auto max-[760px]:hidden">
          <ClientList clients={visible} colorOf={colorOf} selectedId={selectedId} onSelect={selectClient} />
          {unlocated.length > 0 && <UnlocatedList clients={unlocated} onSelect={selectClient} />}
        </div>
      )}

      <div className={`absolute end-3 top-3 z-[1] grid gap-2 min-[761px]:end-auto min-[761px]:start-3 ${selected ? 'max-[760px]:hidden' : ''}`}>
        <div className="grid overflow-hidden rounded-xl border border-border bg-card shadow-popover" role="group" aria-label={t('mapViewMode')}>
          <Button type="button" variant={is3d ? 'ghost' : 'primary'} size="icon" className="rounded-none" aria-pressed={!is3d} title={t('map2d')} aria-label={t('map2d')} onClick={() => setIs3d(false)}><Square size={17} /></Button>
          <Button type="button" variant={is3d ? 'primary' : 'ghost'} size="icon" className="rounded-none" aria-pressed={is3d} title={t('map3d')} aria-label={t('map3d')} onClick={() => setIs3d(true)}><Box size={17} /></Button>
        </div>
        <Button type="button" variant={userLocation ? 'primary' : 'secondary'} size="icon" className="rounded-xl shadow-popover" title={t('mapMyLocation')} aria-label={t('mapMyLocation')} disabled={locating} onClick={() => locateMe()}><Crosshair size={17} className={locating ? 'animate-pulse' : ''} /></Button>
        <Button type="button" variant="secondary" size="icon" className="rounded-xl bg-card shadow-popover" title={t('mapFitAll')} aria-label={t('mapFitAll')} onClick={() => setFitSignal((value) => value + 1)}><Locate size={17} /></Button>
        <Button type="button" variant={listOpen ? 'primary' : 'secondary'} size="icon" className="rounded-xl shadow-popover" title={t('mapListView')} aria-label={t('mapListView')} aria-pressed={listOpen} onClick={() => setListOpen((value) => !value)}><List size={17} /></Button>
      </div>

      {gpsError && !editingClient && (
        <p className="absolute inset-x-3 bottom-3 z-[4] mx-auto m-0 flex max-w-sm items-center justify-between gap-2 rounded-lg border border-destructive bg-card p-3 text-xs text-destructive shadow-popover min-[761px]:bottom-auto min-[761px]:top-3" role="alert">
          {gpsError}
          <Button type="button" variant="ghost" size="icon" className="size-6" aria-label={t('close')} onClick={() => setGpsError('')}><X size={14} /></Button>
        </p>
      )}

      {listOpen && !selected && !editingClient && (
        <div className="absolute inset-x-3 bottom-3 z-[1] grid max-h-[48%] gap-3 overflow-y-auto min-[761px]:hidden">
          <ClientList clients={visible} colorOf={colorOf} selectedId={selectedId} onSelect={selectClient} />
          {unlocated.length > 0 && <UnlocatedList clients={unlocated} onSelect={selectClient} />}
        </div>
      )}

      {editingClient && (
        <div className="absolute inset-x-3 bottom-3 z-[3] mx-auto grid max-w-md gap-2 rounded-2xl border border-border bg-card p-3.5 shadow-popover" role="region" aria-label={t('mapMovePin')}>
          <div className="flex items-start justify-between gap-2">
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-sm text-foreground">{editingClient.name}</strong>
              <p className="m-0 text-xs text-muted-foreground">{t('mapMoveHint')}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={t('cancel')} onClick={stopEditing}><X size={16} /></Button>
          </div>
          <CoordinateInput value={pending} onApply={applyCoords} />
          <Button type="button" variant="secondary" size="sm" disabled={locating} onClick={() => locateMe(applyCoords)}><Crosshair size={14} /> {t('mapUseMyLocation')}</Button>
          {gpsError && <p className="m-0 text-xs text-destructive" role="alert">{gpsError}</p>}
          {locationError && <p className="m-0 text-xs text-destructive" role="alert">{locationError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={stopEditing}>{t('cancel')}</Button>
            <Button type="button" variant="primary" disabled={!pending || savingLocation} onClick={() => void saveLocation()}>{t('mapSaveLocation')}</Button>
          </div>
        </div>
      )}

      {selected && !editingClient && (
        <div className={`absolute inset-x-0 bottom-0 z-[2] overflow-y-auto rounded-t-2xl border border-border bg-card shadow-popover min-[761px]:inset-x-auto min-[761px]:bottom-3 min-[761px]:end-3 min-[761px]:w-[380px] min-[761px]:rounded-xl ${expanded ? 'max-h-[calc(100%-4.5rem)] min-[761px]:top-3 min-[761px]:max-h-none' : 'max-h-[60%]'}`}>
          <ClientSummary
            client={selected}
            canManage={data.canManage}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            onClose={() => selectClient(null)}
            onMove={() => startEditing(selected)}
          />
          {expanded && (
            <ClientPanel client={selected} drivers={data.canManage ? data.drivers : []} today={data.today} canManage={data.canManage} driverName={driverName} onClose={() => selectClient(null)} onChanged={() => void load()} />
          )}
        </div>
      )}
    </div>
  );
}

function CoordinateInput({ value, onApply }: { value: Coords | null; onApply: (coords: Coords) => void }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    if (draft === null) return;
    const parts = draft.split(/[,\s;]+/).filter(Boolean).map(Number);
    const [latitude, longitude] = parts;
    if (parts.length === 2 && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      setInvalid(false);
      setDraft(null);
      onApply({ latitude, longitude });
    } else {
      setInvalid(true);
    }
  }

  return (
    <div className="grid gap-1">
      <label className="text-caption font-semibold text-subtle" htmlFor="map-coordinates">{t('mapCoordinates')}</label>
      <Input
        id="map-coordinates"
        dir="ltr"
        inputMode="text"
        autoComplete="off"
        value={draft ?? (value ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}` : '')}
        placeholder="33.573100, -7.589800"
        aria-invalid={invalid}
        onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
      />
      {invalid && <p className="m-0 text-xs text-destructive" role="alert">{t('mapCoordinatesInvalid')}</p>}
    </div>
  );
}

function SearchGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-0.5">
      <h3 className="m-0 px-2.5 pt-1.5 text-caption font-bold uppercase tracking-wide text-subtle">{label}</h3>
      <ul className="m-0 grid list-none gap-0.5 p-0">{children}</ul>
    </section>
  );
}

function SearchRow({ icon, title, subtitle, onClick }: { icon: ReactNode; title: string; subtitle?: string; onClick: () => void }) {
  return (
    <li>
      <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-2.5 py-2 text-start" onClick={onClick}>
        <span className="grid size-6 shrink-0 place-items-center">{icon}</span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <strong className="truncate text-xs text-foreground">{title}</strong>
          {subtitle && <small className="truncate text-caption text-subtle">{subtitle}</small>}
        </span>
      </Button>
    </li>
  );
}

function ClientSummary({
  client,
  canManage,
  expanded,
  onToggle,
  onClose,
  onMove,
}: {
  client: MapClient;
  canManage: boolean;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMove: () => void;
}) {
  const { t } = useLocale();
  const overdue = client.overdueMad ?? 0;
  const balance = client.balanceMad ?? 0;
  return (
    <div className="grid gap-3 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <strong className="truncate text-sm text-foreground">{client.name}</strong>
          <small className="truncate text-xs text-subtle">{client.city || client.address}</small>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t('close')} onClick={onClose}><X size={16} /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={URGENCY_BADGE[client.urgency]}>{t(URGENCY_LABEL_KEYS[client.urgency])}</Badge>
        <Badge variant="outline">{client.openOrders.length} {t('openOrders')}</Badge>
        {balance > 0 && <Badge variant={overdue > 0 ? 'destructive' : 'secondary'}><span dir="ltr">{balance.toFixed(2)} MAD</span></Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {client.phone && (
          <Button asChild variant="secondary" size="sm"><a href={`tel:${client.phone}`}><Phone size={14} /> {t('mapCall')}</a></Button>
        )}
        {hasCoords(client) && (
          <Button asChild variant="secondary" size="sm"><a href={`https://www.google.com/maps/dir/?api=1&destination=${client.latitude},${client.longitude}`} target="_blank" rel="noopener noreferrer"><Navigation size={14} /> {t('mapDirections')}</a></Button>
        )}
        {canManage && (
          <Button type="button" variant="secondary" size="sm" onClick={onMove}><MapPin size={14} /> {hasCoords(client) ? t('mapMovePin') : t('mapSetLocation')}</Button>
        )}
        <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {expanded ? t('mapLessDetails') : t('mapDetails')}
        </Button>
      </div>
    </div>
  );
}

function UnlocatedList({ clients, onSelect }: { clients: MapClient[]; onSelect: (id: string) => void }) {
  const { t } = useLocale();
  return (
    <section className="grid gap-2 rounded-xl border border-border bg-card p-3 shadow-popover">
      <h2 className="m-0 text-sm font-bold text-foreground">{t('mapNotOnMap')} ({clients.length})</h2>
      <p className="m-0 text-caption text-subtle">{t('mapNotOnMapHint')}</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {clients.map((client) => (
          <li key={client.id}><Button type="button" variant="secondary" size="sm" onClick={() => onSelect(client.id)}>{client.name}</Button></li>
        ))}
      </ul>
    </section>
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
    <section className="grid gap-2 rounded-xl border border-border bg-card p-3 shadow-popover">
      <h2 className="m-0 flex items-center gap-1.5 text-sm font-bold text-foreground"><Store size={14} aria-hidden="true" />{t('mapListView')} ({clients.length})</h2>
      <ul className="m-0 grid max-h-[min(50vh,28rem)] list-none gap-1 overflow-y-auto p-0">
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
  is3d,
  fitSignal,
  flyTo,
  editId,
  hasPending,
  userLocation,
  onCenter,
}: {
  clients: MapClient[];
  colorOf: (client: MapClient) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  is3d: boolean;
  fitSignal: number;
  flyTo: FlyTarget | null;
  editId: string | null;
  hasPending: boolean;
  userLocation: (Coords & { accuracy: number }) | null;
  onCenter: (latitude: number, longitude: number) => void;
}) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onCenterRef = useRef(onCenter);
  const editIdRef = useRef(editId);
  const hasPendingRef = useRef(hasPending);
  const is3dRef = useRef(is3d);
  const [token, setToken] = useState('');
  const [styleUrl, setStyleUrl] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [zoom, setZoom] = useState(5);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onCenterRef.current = onCenter;
    hasPendingRef.current = hasPending;
  }, [onSelect, onCenter, hasPending]);

  useEffect(() => {
    let disposed = false;
    void fetch('/api/operations/mapbox-token', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { token?: string; style?: string };
        if (disposed) return;
        if (!response.ok || !result.token?.startsWith('pk.')) {
          setStatus(response.status === 503 ? 'missing' : 'error');
          return;
        }
        setToken(result.token);
        setStyleUrl(result.style ?? '');
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
    if (!token || !styleUrl || !containerRef.current) return;
    let disposed = false;
    const markers = markersRef;
    void import('mapbox-gl')
      .then(({ default: mapboxgl }) => {
        if (disposed || !containerRef.current) return;
        const map = new mapboxgl.Map({
          accessToken: token,
          container: containerRef.current,
          style: styleUrl,
          center: [-7.5898, 33.5731],
          zoom: 5,
          pitch: is3dRef.current ? 60 : 0,
          bearing: is3dRef.current ? -17 : 0,
          antialias: true,
        });
        map.on('error', () => setMapError(true));
        map.once('load', () => setMapReady(true));
        map.on('zoomend', () => setZoom(Math.round(map.getZoom())));
        map.on('moveend', () => {
          if (!editIdRef.current) return;
          const center = map.getCenter();
          onCenterRef.current(center.lat, center.lng);
        });
        map.on('style.load', () => syncBuildings(map, is3dRef.current));
        mapRef.current = map;
      })
      .catch(() => {
        if (!disposed) setMapError(true);
      });
    return () => {
      disposed = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
  }, [token, styleUrl]);

  useEffect(() => {
    is3dRef.current = is3d;
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.easeTo({ pitch: is3d ? 60 : 0, bearing: is3d ? -17 : 0, duration: 700 });
    syncBuildings(map, is3d);
  }, [is3d, mapReady]);

  // Pins are clustered on the client so dense areas stay readable at low zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let disposed = false;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (disposed) return;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      const located = clients.filter((client): client is MapClient & { latitude: number; longitude: number } => client.latitude !== null && client.longitude !== null);
      const byId = new Map(located.map((client) => [client.id, client]));
      const index = new Supercluster<{ id: string }>({ radius: 56, maxZoom: 15 });
      index.load(located.map((client) => ({ type: 'Feature' as const, properties: { id: client.id }, geometry: { type: 'Point' as const, coordinates: [client.longitude, client.latitude] } })));

      for (const feature of index.getClusters([-180, -85, 180, 85], zoom)) {
        const [lng, lat] = feature.geometry.coordinates;
        const props = feature.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string };
        const element = document.createElement('div');
        if (props.cluster && props.cluster_id !== undefined) {
          const clusterId = props.cluster_id;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'grid size-10 place-items-center rounded-full border-2 border-white bg-primary text-xs font-bold text-primary-foreground shadow-lg';
          button.textContent = String(props.point_count ?? '');
          button.setAttribute('aria-label', `${props.point_count} ${t('mapStores')}`);
          button.addEventListener('click', () => map.easeTo({ center: [lng, lat], zoom: Math.min(index.getClusterExpansionZoom(clusterId), 18), duration: 500 }));
          element.append(button);
        } else {
          const client = props.id ? byId.get(props.id) : undefined;
          if (!client) continue;
          const isSelected = client.id === selectedId;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'relative size-5 rounded-full border-2 border-white shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
          button.style.backgroundColor = colorOf(client);
          if (isSelected) button.style.transform = 'scale(1.5)';
          button.setAttribute('aria-label', client.name);
          button.addEventListener('click', () => onSelectRef.current(client.id));
          if (isSelected || zoom >= 10) {
            const label = document.createElement('span');
            label.className = 'pointer-events-none absolute left-1/2 top-full mt-1 max-w-36 -translate-x-1/2 truncate whitespace-nowrap rounded bg-card/90 px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow';
            label.textContent = client.name;
            button.append(label);
          }
          element.style.zIndex = isSelected ? '2' : '';
          element.append(button);
        }
        markersRef.current.push(new mapboxgl.Marker({ element }).setLngLat([lng, lat]).addTo(map));
      }

      if (!fittedRef.current && located.length > 0) {
        fittedRef.current = true;
        const bounds = new mapboxgl.LngLatBounds();
        located.forEach((client) => bounds.extend([client.longitude, client.latitude]));
        if (located.length === 1) map.jumpTo({ center: bounds.getCenter(), zoom: 11 });
        else map.fitBounds(bounds, { padding: 56, maxZoom: 11, duration: 0 });
      }
    });
    return () => {
      disposed = true;
    };
  }, [clients, colorOf, selectedId, zoom, mapReady, t]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !userLocation) return;
    let marker: MapboxMarker | undefined;
    let disposed = false;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (disposed) return;
      const element = document.createElement('div');
      element.className = 'size-4 rounded-full border-[3px] border-white bg-blue-500 shadow-[0_0_0_6px_rgba(59,130,246,0.25)]';
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', t('mapYouAreHere'));
      marker = new mapboxgl.Marker({ element }).setLngLat([userLocation.longitude, userLocation.latitude]).addTo(map);
    });
    return () => {
      disposed = true;
      marker?.remove();
    };
  }, [userLocation, mapReady, t]);

  useEffect(() => {
    editIdRef.current = editId;
    const map = mapRef.current;
    if (!editId || !mapReady || !map || hasPendingRef.current) return;
    // A store without a location starts from wherever the map currently points.
    map.jumpTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    const center = map.getCenter();
    onCenterRef.current(center.lat, center.lng);
  }, [editId, mapReady]);

  useEffect(() => {
    if (!flyTo || !mapReady) return;
    mapRef.current?.flyTo({ center: [flyTo.longitude, flyTo.latitude], zoom: flyTo.zoom ?? 15, duration: 900, padding: { top: 0, bottom: editIdRef.current ? 0 : phoneSheetPadding(), left: 0, right: 0 } });
  }, [flyTo, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || fitSignal === 0) return;
    const located = clients.filter((client) => client.latitude !== null && client.longitude !== null);
    if (located.length === 0) return;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      const bounds = new mapboxgl.LngLatBounds();
      located.forEach((client) => bounds.extend([client.longitude as number, client.latitude as number]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 700 });
    });
    // Only refit when the button is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  useEffect(() => {
    const client = clients.find((candidate) => candidate.id === selectedId);
    if (client && mapReady && client.latitude !== null && client.longitude !== null) {
      mapRef.current?.easeTo({ center: [client.longitude, client.latitude], duration: 500, padding: { top: 0, bottom: phoneSheetPadding(), left: 0, right: 0 } });
    }
    // Re-centre only when the selection changes, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, mapReady]);

  if (status === 'loading') return <p className="absolute inset-x-3 top-24 m-0 flex min-h-28 items-center justify-center rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground min-[761px]:start-16" role="status">{t('loadingMap')}</p>;
  if (status !== 'ready') {
    return (
      <div className="absolute inset-x-3 top-24 flex min-h-28 items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground min-[761px]:start-16" role="status">
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
    <>
      {/* mapbox-gl.css forces position:relative on its container, so the sizing wrapper is separate. */}
      <div className="absolute inset-0"><div ref={containerRef} className="size-full" role="region" aria-label={t('clientStoreMap')} /></div>
      {mapError && <p className="absolute inset-x-3 bottom-3 m-0 rounded-md border border-destructive bg-destructive-soft p-3 text-sm text-destructive shadow-sm" role="alert">{t('mapboxRenderError')}</p>}
    </>
  );
}

// On phones the summary sheet covers the lower part of the map, so keep the selected store above it.
const phoneSheetPadding = () => (typeof window !== 'undefined' && window.innerWidth <= 760 ? 220 : 0);

// Shows 3D buildings: reuses the style's own extrusion layer or adds one from the standard building source.
function syncBuildings(map: MapboxMap, on: boolean) {
  const layers = map.getStyle()?.layers ?? [];
  const existing = layers.find((layer) => layer.type === 'fill-extrusion');
  if (existing) {
    map.setLayoutProperty(existing.id, 'visibility', on ? 'visible' : 'none');
    return;
  }
  if (!on || !map.getSource('composite')) return;
  try {
    map.addLayer({
      id: 'elbaraka-3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', 'extrude', 'true'],
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#c9d4cd',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.8,
      },
    });
  } catch {
    // Styles without the building source simply stay flat.
  }
}
