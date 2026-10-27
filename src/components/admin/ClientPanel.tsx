'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Phone, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  OPEN_ORDER_STATUSES,
  orderUrgency,
  type MapClient,
  type MapDriver,
  type OrderPriority,
  type OrderStatus,
  type Urgency,
} from '@/lib/delivery-map';
import type { TranslationKey } from '@/lib/i18n';
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

export const URGENCY_LABEL_KEYS: Record<Urgency, TranslationKey> = {
  overdue: 'urgencyOverdue',
  due_today: 'urgencyDueToday',
  upcoming: 'urgencyUpcoming',
  awaiting: 'urgencyAwaiting',
  none: 'urgencyNone',
};

export const URGENCY_BADGE: Record<Urgency, 'destructive' | 'warning' | 'success' | 'secondary' | 'outline'> = {
  overdue: 'destructive',
  due_today: 'warning',
  upcoming: 'success',
  awaiting: 'secondary',
  none: 'outline',
};

export const STATUS_LABEL_KEYS: Record<OrderStatus, TranslationKey> = {
  draft: 'draft',
  confirmed: 'confirmed',
  part_delivered: 'statusPartDelivered',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
};

type OrderDetail = {
  id: string;
  documentNumber: string;
  status: OrderStatus;
  priority: OrderPriority;
  requestedDeliveryDate: string | null;
  assignedDriverId: string | null;
  notes: string;
  cancelReason: string | null;
  createdAt: string;
  totalMad: number;
  lines: { sku: string; name: string; quantity: number }[];
  events: { type: string; at: string; detail: Record<string, unknown> | null }[];
};

const NO_DRIVER = '__none';

function OrderRow({
  order,
  today,
  drivers,
  canManage,
  driverName,
  onSaved,
}: {
  order: OrderDetail;
  today: string;
  drivers: MapDriver[];
  canManage: boolean;
  driverName: (id: string | null) => string;
  onSaved: () => void;
}) {
  const { t, locale } = useLocale();
  const isOpen = OPEN_ORDER_STATUSES.includes(order.status);
  const urgency = orderUrgency(order, today);
  const [editing, setEditing] = useState(false);
  const [driverId, setDriverId] = useState(order.assignedDriverId ?? NO_DRIVER);
  const [date, setDate] = useState(order.requestedDeliveryDate ?? '');
  const [priority, setPriority] = useState<OrderPriority>(order.priority);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/operations/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          orderId: order.id,
          driverId: driverId === NO_DRIVER ? null : driverId,
          requestedDeliveryDate: date || null,
          priority,
          notes: order.notes,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        setError(result.error ?? t('mapActionFailed'));
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError(t('mapActionFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="grid gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs text-foreground" dir="ltr">{order.documentNumber}</strong>
        <div className="flex flex-wrap items-center gap-1.5">
          {order.priority === 'urgent' && <Badge variant="destructive">{t('priorityUrgent')}</Badge>}
          {isOpen && urgency !== 'upcoming' && <Badge variant={URGENCY_BADGE[urgency]}>{t(URGENCY_LABEL_KEYS[urgency])}</Badge>}
          <Badge variant="outline">{t(STATUS_LABEL_KEYS[order.status])}</Badge>
        </div>
      </div>
      <p className="m-0 text-caption text-subtle">
        {order.requestedDeliveryDate ? `${t('requestedDate')}: ${order.requestedDeliveryDate}` : t('noRequestedDate')}
        {' · '}{order.lines.length} {t('orderLines')} · {formatMad(order.totalMad, locale)}
      </p>
      {isOpen && <p className="m-0 text-caption text-subtle">{t('mapDriver')}: {driverName(order.assignedDriverId)}</p>}
      {order.cancelReason && <p className="m-0 text-caption text-subtle">{order.cancelReason}</p>}
      {order.events.length > 0 && (
        <ol className="m-0 grid list-none gap-0.5 p-0 text-micro text-subtle">
          {order.events.map((event) => (
            <li key={`${event.type}-${event.at}`}>{new Date(event.at).toLocaleDateString(locale === 'ar' ? 'ar-MA' : 'en-GB')} · {t(`event_${event.type}` as TranslationKey)}</li>
          ))}
        </ol>
      )}
      {canManage && isOpen && !editing && (
        <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => setEditing(true)}>{t('mapAssign')}</Button>
      )}
      {editing && (
        <div className="grid gap-2 rounded-md bg-surface p-2.5">
          <Label className="grid gap-1 text-caption text-subtle">
            {t('mapDriver')}
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DRIVER}>{t('mapUnassigned')}</SelectItem>
                {drivers.map((driver) => <SelectItem key={driver.userId} value={driver.userId}>{driver.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-caption text-subtle">
            {t('requestedDate')}
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Label>
          <Label className="grid gap-1 text-caption text-subtle">
            {t('priority')}
            <Select value={priority} onValueChange={(value) => setPriority(value as OrderPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">{t('priorityNormal')}</SelectItem>
                <SelectItem value="urgent">{t('priorityUrgent')}</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          {error && <p className="m-0 text-caption text-destructive" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="primary" size="sm" disabled={saving} onClick={() => void save()}>{t('saveChanges')}</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>{t('cancel')}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ClientPanel({
  client,
  drivers,
  today,
  canManage,
  driverName,
  onClose,
  onChanged,
}: {
  client: MapClient;
  drivers: MapDriver[];
  today: string;
  canManage: boolean;
  driverName: (id: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useLocale();
  const [orders, setOrders] = useState<OrderDetail[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [defaultDriver, setDefaultDriver] = useState(client.defaultDriverId ?? NO_DRIVER);
  const [defaultError, setDefaultError] = useState('');

  const loadOrders = useCallback(async () => {
    try {
      const response = await fetch(`/api/operations/orders?clientId=${client.id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('load');
      const result = await response.json() as { orders: OrderDetail[] };
      setOrders(result.orders);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [client.id]);

  useEffect(() => {
    setOrders(null);
    setDefaultDriver(client.defaultDriverId ?? NO_DRIVER);
    void loadOrders();
  }, [client.id, client.defaultDriverId, loadOrders]);

  async function changeDefaultDriver(value: string) {
    setDefaultDriver(value);
    setDefaultError('');
    const response = await fetch('/api/operations/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_client_driver', clientId: client.id, driverId: value === NO_DRIVER ? null : value }),
    }).catch(() => null);
    if (!response?.ok) {
      setDefaultError(t('mapActionFailed'));
      setDefaultDriver(client.defaultDriverId ?? NO_DRIVER);
      return;
    }
    onChanged();
  }

  function refresh() {
    void loadOrders();
    onChanged();
  }

  const open = orders?.filter((order) => OPEN_ORDER_STATUSES.includes(order.status)) ?? [];
  const history = orders?.filter((order) => !OPEN_ORDER_STATUSES.includes(order.status)) ?? [];
  const mapsUrl = client.latitude !== null && client.longitude !== null
    ? `https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}`
    : null;

  return (
    <aside className="grid content-start gap-4 rounded-lg border border-border bg-card p-4" aria-label={client.name}>
      <header className="flex items-start justify-between gap-2">
        <div className="grid gap-1.5">
          <h2 className="m-0 text-base font-bold text-foreground">{client.name}</h2>
          <Badge variant={URGENCY_BADGE[client.urgency]} className="justify-self-start">{t(URGENCY_LABEL_KEYS[client.urgency])}</Badge>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t('close')} onClick={onClose}><X size={18} /></Button>
      </header>

      <div className="grid gap-1 text-xs text-muted-foreground">
        {client.contactName && <span>{client.contactName}</span>}
        {client.phone && <a className="inline-flex items-center gap-1.5 text-primary" href={`tel:${client.phone}`} dir="ltr"><Phone size={14} />{client.phone}</a>}
        {(client.address || client.city) && <span className="inline-flex items-start gap-1.5"><MapPin size={14} className="mt-0.5 shrink-0" />{[client.address, client.city].filter(Boolean).join(', ')}</span>}
        {mapsUrl && <a className="text-primary" href={mapsUrl} target="_blank" rel="noreferrer">{t('mapOpenInMaps')}</a>}
      </div>

      <section className="grid gap-2">
        <h3 className="m-0 text-label font-bold text-subtle">{t('mapInCharge')}</h3>
        {canManage ? (
          <Label className="grid gap-1 text-caption text-subtle">
            {t('mapDefaultDriver')}
            <Select value={defaultDriver} onValueChange={(value) => void changeDefaultDriver(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DRIVER}>{t('mapUnassigned')}</SelectItem>
                {drivers.map((driver) => <SelectItem key={driver.userId} value={driver.userId}>{driver.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
        ) : <p className="m-0 text-xs text-muted-foreground">{driverName(client.driverId)}</p>}
        {defaultError && <p className="m-0 text-caption text-destructive" role="alert">{defaultError}</p>}
      </section>

      {loadError && (
        <p className="m-0 text-xs text-destructive" role="alert">
          {t('mapLoadError')} <Button type="button" variant="link" onClick={() => void loadOrders()}>{t('retry')}</Button>
        </p>
      )}
      {!orders && !loadError && <p className="m-0 text-xs text-subtle" role="status">{t('mapLoadingOrders')}</p>}

      {orders && (
        <>
          <section className="grid gap-2">
            <h3 className="m-0 text-label font-bold text-subtle">{t('openOrders')} ({open.length})</h3>
            {open.length === 0
              ? <p className="m-0 text-xs text-subtle">{t('mapNoOpenOrders')}</p>
              : <ul className="m-0 grid list-none gap-2 p-0">{open.map((order) => <OrderRow key={order.id} order={order} today={today} drivers={drivers} canManage={canManage} driverName={driverName} onSaved={refresh} />)}</ul>}
          </section>
          <section className="grid gap-2">
            <h3 className="m-0 text-label font-bold text-subtle">{t('mapHistory')}</h3>
            {history.length === 0
              ? <p className="m-0 text-xs text-subtle">{t('mapNoHistory')}</p>
              : <ul className="m-0 grid list-none gap-2 p-0">{history.map((order) => <OrderRow key={order.id} order={order} today={today} drivers={drivers} canManage={false} driverName={driverName} onSaved={refresh} />)}</ul>}
          </section>
        </>
      )}
    </aside>
  );
}
