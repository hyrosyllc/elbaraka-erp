'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { OPEN_ORDER_STATUSES, orderUrgency, casablancaToday, type MapDriver, type OrderPriority, type OrderStatus } from '@/lib/delivery-map';
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';
import { STATUS_LABEL_KEYS, URGENCY_BADGE, URGENCY_LABEL_KEYS } from './ClientPanel';

type Order = {
  id: string;
  documentNumber: string;
  clientId: string;
  clientName: string;
  status: OrderStatus;
  priority: OrderPriority;
  requestedDeliveryDate: string | null;
  assignedDriverId: string | null;
  notes: string;
  totalMad: number;
  lines: { itemId: string; sku: string; name: string; quantity: number; unitPriceMad: number }[];
};
type Product = { itemId: string; sku: string; name: string; priceMad: number };
type ClientOption = { id: string; name: string };
type DraftLine = { key: string; itemId: string; quantity: string };

const NO_DRIVER = '__none';
const STATUS_BADGE: Record<OrderStatus, 'secondary' | 'success' | 'warning' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  confirmed: 'success',
  part_delivered: 'warning',
  delivered: 'outline',
  cancelled: 'destructive',
};

export function LiveOrdersPage() {
  const { t, locale } = useLocale();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [drivers, setDrivers] = useState<MapDriver[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [dispatchTarget, setDispatchTarget] = useState<Order | null>(null);
  const today = casablancaToday();

  const load = useCallback(async () => {
    try {
      const [ordersResponse, clientsResponse] = await Promise.all([
        fetch('/api/operations/orders', { cache: 'no-store' }),
        fetch('/api/operations/clients', { cache: 'no-store' }),
      ]);
      if (!ordersResponse.ok) throw new Error('load');
      const result = await ordersResponse.json() as { orders: Order[]; products: Product[]; drivers: MapDriver[]; canManage: boolean };
      setOrders(result.orders);
      setProducts(result.products);
      setDrivers(result.drivers);
      setCanManage(result.canManage);
      if (clientsResponse.ok) {
        const clientResult = await clientsResponse.json() as { clients: { id: string; name: string; is_active: boolean }[] };
        setClients(clientResult.clients.filter((client) => client.is_active).map((client) => ({ id: client.id, name: client.name })));
      }
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>, okText: string, orderId?: string, url = '/api/operations/orders'): Promise<boolean> {
    setBusyId(orderId ?? 'new');
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; shortages?: { sku: string; short: number }[] };
      if (!response.ok) {
        const shortages = result.shortages?.map((item) => `${item.sku} (−${item.short})`).join(', ');
        setMessage({ tone: 'error', text: [result.error ?? t('mapActionFailed'), shortages].filter(Boolean).join(' ') });
        return false;
      }
      setMessage({ tone: 'ok', text: okText });
      await load();
      return true;
    } catch {
      setMessage({ tone: 'error', text: t('mapActionFailed') });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const driverName = (id: string | null) => (id ? drivers.find((driver) => driver.userId === id)?.fullName ?? t('mapAssignedDriver') : t('mapUnassigned'));

  if (loading) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingOrders')}</p>;
  if (loadError) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">{t('mapLoadError')} <Button type="button" variant="link" onClick={() => { setLoading(true); void load(); }}>{t('retry')}</Button></p>;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs text-subtle">{orders.length} {t('totalRecords')}</p>
        {canManage && <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}><Plus size={16} />{t('newOrder')}</Button>}
      </div>
      {message && <p className={`m-0 rounded-md border p-3 text-xs ${message.tone === 'ok' ? 'border-success bg-secondary text-success' : 'border-destructive bg-destructive-soft text-destructive'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}

      {orders.length === 0 ? <p className="m-0 text-xs text-subtle">{t('noOrdersYet')}</p> : (
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <Table className="w-full min-w-max text-start text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>{t('orderNumber')}</TableHead>
                <TableHead>{t('customerOrStore')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('requestedDate')}</TableHead>
                <TableHead>{t('mapDriver')}</TableHead>
                <TableHead>{t('total')}</TableHead>
                {canManage && <TableHead>{t('actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const isOpen = OPEN_ORDER_STATUSES.includes(order.status);
                const urgency = orderUrgency(order, today);
                return (
                  <TableRow key={order.id}>
                    <TableCell><strong dir="ltr">{order.documentNumber}</strong></TableCell>
                    <TableCell>{order.clientName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={STATUS_BADGE[order.status]}>{t(STATUS_LABEL_KEYS[order.status])}</Badge>
                        {order.priority === 'urgent' && isOpen && <Badge variant="destructive">{t('priorityUrgent')}</Badge>}
                        {urgency === 'overdue' && <Badge variant={URGENCY_BADGE.overdue}>{t(URGENCY_LABEL_KEYS.overdue)}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{order.requestedDeliveryDate ?? '—'}</TableCell>
                    <TableCell>{isOpen ? driverName(order.assignedDriverId) : '—'}</TableCell>
                    <TableCell>{formatMad(order.totalMad, locale)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {order.status === 'draft' && (
                            <Button type="button" variant="primary" size="sm" disabled={busyId === order.id} onClick={() => void post({ action: 'confirm', orderId: order.id }, t('orderConfirmed'), order.id)}>{t('confirm')}</Button>
                          )}
                          {(order.status === 'confirmed' || order.status === 'part_delivered') && (
                            <Button type="button" variant="primary" size="sm" disabled={busyId === order.id} onClick={() => void post({ action: 'create', orderId: order.id, idempotencyKey: crypto.randomUUID() }, t('deliveryNoteCreated'), order.id, '/api/operations/deliveries')}>{t('createDeliveryNoteAction')}</Button>
                          )}
                          {isOpen && <Button type="button" variant="secondary" size="sm" onClick={() => setDispatchTarget(order)}>{t('mapAssign')}</Button>}
                          {(order.status === 'draft' || order.status === 'confirmed') && (
                            <Button type="button" variant="secondary" size="sm" onClick={() => setCancelTarget(order)}>{t('cancelOrder')}</Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canManage && (
        <CreateOrderDialog
          open={createOpen}
          clients={clients}
          products={products}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (body) => {
            const ok = await post({ action: 'create', ...body }, t('draftOrderCreated'));
            if (ok) setCreateOpen(false);
            return ok;
          }}
        />
      )}
      <CancelDialog
        order={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onSubmit={async (reason) => {
          if (!cancelTarget) return;
          const ok = await post({ action: 'cancel', orderId: cancelTarget.id, reason }, t('orderCancelled'), cancelTarget.id);
          if (ok) setCancelTarget(null);
        }}
      />
      <DispatchDialog
        order={dispatchTarget}
        drivers={drivers}
        onClose={() => setDispatchTarget(null)}
        onSubmit={async (values) => {
          if (!dispatchTarget) return;
          const ok = await post({ action: 'assign', orderId: dispatchTarget.id, notes: dispatchTarget.notes, ...values }, t('orderUpdated'), dispatchTarget.id);
          if (ok) setDispatchTarget(null);
        }}
      />
    </section>
  );
}

function CreateOrderDialog({
  open,
  clients,
  products,
  onClose,
  onSubmit,
}: {
  open: boolean;
  clients: ClientOption[];
  products: Product[];
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t, locale } = useLocale();
  const [clientId, setClientId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ key: 'l0', itemId: '', quantity: '1' }]);
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState<OrderPriority>('normal');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);

  const productById = useMemo(() => new Map(products.map((product) => [product.itemId, product])), [products]);
  const parsedLines = lines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) }));
  const valid = clientId !== '' && parsedLines.every((line) => line.itemId && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 10000)
    && new Set(parsedLines.map((line) => line.itemId)).size === parsedLines.length;
  const total = parsedLines.reduce((sum, line) => sum + (productById.get(line.itemId)?.priceMad ?? 0) * (Number.isFinite(line.quantity) ? line.quantity : 0), 0);

  async function submit() {
    setSubmitting(true);
    const ok = await onSubmit({ clientId, lines: parsedLines, requestedDeliveryDate: date || null, priority, notes, idempotencyKey });
    setSubmitting(false);
    if (ok) {
      setClientId('');
      setLines([{ key: 'l0', itemId: '', quantity: '1' }]);
      setDate('');
      setPriority('normal');
      setNotes('');
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{t('newOrder')}</DialogTitle><DialogDescription>{t('newOrderHint')}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-3">
          <Label className="grid gap-1 text-caption text-subtle">
            {t('customerOrStore')}
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder={t('selectClient')} /></SelectTrigger>
              <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <div className="grid gap-2">
            {lines.map((line, index) => (
              <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-end gap-2">
                <Label className="grid gap-1 text-caption text-subtle">
                  {index === 0 ? t('orderProduct') : <span className="sr-only">{t('orderProduct')}</span>}
                  <Select value={line.itemId} onValueChange={(value) => setLines((current) => current.map((candidate) => (candidate.key === line.key ? { ...candidate, itemId: value } : candidate)))}>
                    <SelectTrigger><SelectValue placeholder={t('selectProduct')} /></SelectTrigger>
                    <SelectContent>{products.map((product) => <SelectItem key={product.itemId} value={product.itemId}>{product.name} · {formatMad(product.priceMad, locale)}</SelectItem>)}</SelectContent>
                  </Select>
                </Label>
                <Label className="grid gap-1 text-caption text-subtle">
                  {index === 0 ? t('quantity') : <span className="sr-only">{t('quantity')}</span>}
                  <Input type="number" min={1} max={10000} step={1} value={line.quantity} onChange={(event) => setLines((current) => current.map((candidate) => (candidate.key === line.key ? { ...candidate, quantity: event.target.value } : candidate)))} />
                </Label>
                <Button type="button" variant="ghost" size="icon" aria-label={t('removeLine')} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}><Trash2 size={16} /></Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), itemId: '', quantity: '1' }])}><Plus size={14} />{t('addLine')}</Button>
            {products.length === 0 && <p className="m-0 text-caption text-destructive">{t('noPricedProducts')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <Label className="grid gap-1 text-caption text-subtle">
            {t('orderNotes')}
            <Textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Label>
          <p className="m-0 text-xs font-bold text-foreground">{t('total')}: {formatMad(total, locale)}</p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="button" variant="primary" disabled={!valid || submitting} onClick={() => void submit()}>{submitting ? t('saving') : t('createOrder')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ order, onClose, onSubmit }: { order: Order | null; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const { t } = useLocale();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={order !== null} onOpenChange={(next) => { if (!next) { setReason(''); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('cancelOrder')} {order?.documentNumber}</DialogTitle><DialogDescription>{t('cancelOrderHint')}</DialogDescription></DialogHeader>
        <DialogBody>
          <Label className="grid gap-1 text-caption text-subtle">
            {t('cancelReason')}
            <Textarea maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Label>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('close')}</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={reason.trim() === '' || submitting}
            onClick={() => { setSubmitting(true); void onSubmit(reason).finally(() => { setSubmitting(false); setReason(''); }); }}
          >{t('cancelOrder')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DispatchDialog({
  order,
  drivers,
  onClose,
  onSubmit,
}: {
  order: Order | null;
  drivers: MapDriver[];
  onClose: () => void;
  onSubmit: (values: { driverId: string | null; requestedDeliveryDate: string | null; priority: OrderPriority }) => Promise<void>;
}) {
  const { t } = useLocale();
  const [driverId, setDriverId] = useState(NO_DRIVER);
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState<OrderPriority>('normal');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!order) return;
    setDriverId(order.assignedDriverId ?? NO_DRIVER);
    setDate(order.requestedDeliveryDate ?? '');
    setPriority(order.priority);
  }, [order]);

  return (
    <Dialog open={order !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('mapAssign')} {order?.documentNumber}</DialogTitle><DialogDescription>{order?.clientName}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-3">
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
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button
            type="button"
            variant="primary"
            disabled={submitting}
            onClick={() => { setSubmitting(true); void onSubmit({ driverId: driverId === NO_DRIVER ? null : driverId, requestedDeliveryDate: date || null, priority }).finally(() => setSubmitting(false)); }}
          >{t('saveChanges')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
