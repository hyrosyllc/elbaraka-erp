'use client';

import { useState } from 'react';
import { PackageCheck, Plus, Trash2, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { TranslationKey } from '@/lib/i18n';
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';
import { OrderProductSelect, type OrderProduct, ProductNotice } from './OrderProductSelect';

export type OpProduct = OrderProduct;
export type OpOrder = { id: string; documentNumber: string; status: string; remainingUnits: number };
export type OpNote = {
  id: string;
  documentNumber: string;
  status: string;
  orderId: string | null;
  invoiced: boolean;
  lines: { id: string; sku: string; name: string; quantity: number; returnable: number }[];
};

type Dialogs =
  | { kind: 'order' }
  | { kind: 'cancel'; order: OpOrder }
  | { kind: 'fail'; note: OpNote }
  | { kind: 'short'; note: OpNote }
  | { kind: 'invoice'; note: OpNote }
  | { kind: 'return'; note: OpNote }
  | null;

const STATUS_KEYS: Record<string, TranslationKey> = {
  draft: 'ordSt_draft', confirmed: 'ordSt_confirmed', part_delivered: 'ordSt_part_delivered', delivered: 'ordSt_delivered', cancelled: 'ordSt_cancelled',
  ready: 'deliveryReady', dispatched: 'deliveryDispatched', failed: 'deliveryFailed',
};

async function call(url: string, body: Record<string, unknown>, fallback: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), ...body }),
    });
    if (response.ok) return null;
    const result = await response.json().catch(() => ({})) as { error?: string };
    return result.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function ClientOperations({
  clientId,
  products,
  orders,
  notes,
  onChanged,
}: {
  clientId: string;
  products: OpProduct[];
  orders: OpOrder[];
  notes: OpNote[];
  onChanged: (message: { tone: 'ok' | 'error'; text: string }) => void;
}) {
  const { t, locale } = useLocale();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, setPending] = useState<string | null>(null);

  const status = (key: string) => (STATUS_KEYS[key] ? t(STATUS_KEYS[key]) : key);

  // Runs a one-click action, reporting the outcome on the page.
  async function run(id: string, url: string, body: Record<string, unknown>, success: string) {
    setPending(id);
    const failure = await call(url, body, t('mapActionFailed'));
    setPending(null);
    onChanged(failure ? { tone: 'error', text: failure } : { tone: 'ok', text: success });
  }

  // Runs an action from a dialog; returns an error string to keep the dialog open.
  async function submit(url: string, body: Record<string, unknown>, success: string): Promise<string | null> {
    const failure = await call(url, body, t('mapActionFailed'));
    if (failure) return failure;
    setDialog(null);
    onChanged({ tone: 'ok', text: success });
    return null;
  }

  const activeOrders = orders.filter((order) => order.status !== 'cancelled' && order.status !== 'delivered');
  const activeNotes = notes.filter((note) => note.status !== 'failed');
  const ORDERS = '/api/operations/orders';
  const DELIVERIES = '/api/operations/deliveries';

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-subtle">{t('opHint')}</p>
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog({ kind: 'order' })}><Plus size={14} />{t('opNewOrder')}</Button>
      </div>

      <div className="grid gap-2">
        {activeOrders.map((order) => (
          <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-xs">
            <span className="flex items-center gap-2"><strong>{order.documentNumber}</strong><Badge variant="secondary">{status(order.status)}</Badge>{order.remainingUnits > 0 && <span className="text-subtle">{t('acctToShip')}: {order.remainingUnits}</span>}</span>
            <span className="flex flex-wrap gap-1.5">
              {order.status === 'draft' && <Button type="button" size="sm" variant="secondary" disabled={pending === order.id} onClick={() => void run(order.id, ORDERS, { action: 'confirm', orderId: order.id }, t('opConfirmed'))}>{t('confirm')}</Button>}
              {(order.status === 'confirmed' || order.status === 'part_delivered') && order.remainingUnits > 0 && <Button type="button" size="sm" variant="secondary" disabled={pending === order.id} onClick={() => void run(order.id, DELIVERIES, { action: 'create', orderId: order.id }, t('deliveryNoteCreated'))}><PackageCheck size={14} />{t('createDeliveryNoteAction')}</Button>}
              {(order.status === 'draft' || order.status === 'confirmed') && <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'cancel', order })}>{t('cancelOrder')}</Button>}
            </span>
          </div>
        ))}
        {activeNotes.map((note) => {
          const returnable = note.lines.some((line) => line.returnable > 0);
          return (
            <div key={note.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-xs">
              <span className="flex items-center gap-2"><Truck size={14} aria-hidden="true" /><strong>{note.documentNumber}</strong><Badge variant={note.status === 'delivered' ? 'success' : 'warning'}>{status(note.status)}</Badge></span>
              <span className="flex flex-wrap gap-1.5">
                {note.status === 'ready' && <Button type="button" size="sm" variant="secondary" disabled={pending === note.id} onClick={() => void run(note.id, DELIVERIES, { action: 'dispatch', noteId: note.id }, t('deliveryDispatchedOk'))}>{t('dispatchAction')}</Button>}
                {note.status === 'dispatched' && <>
                  <Button type="button" size="sm" variant="primary" disabled={pending === note.id} onClick={() => void run(note.id, DELIVERIES, { action: 'deliver', noteId: note.id }, t('deliveryDeliveredOk'))}>{t('markDeliveredAction')}</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setDialog({ kind: 'short', note })}>{t('shortDeliver')}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'fail', note })}>{t('markFailed')}</Button>
                </>}
                {note.status === 'delivered' && !note.invoiced && <Button type="button" size="sm" variant="primary" onClick={() => setDialog({ kind: 'invoice', note })}>{t('opIssueInvoice')}</Button>}
                {note.status === 'delivered' && returnable && <Button type="button" size="sm" variant="secondary" onClick={() => setDialog({ kind: 'return', note })}>{t('opRecordReturn')}</Button>}
              </span>
            </div>
          );
        })}
        {activeOrders.length === 0 && activeNotes.length === 0 && <p className="m-0 text-xs text-subtle">{t('noOrdersYet')}</p>}
      </div>

      <OrderDialog
        open={dialog?.kind === 'order'}
        products={products}
        locale={locale}
        onClose={() => setDialog(null)}
        onSubmit={(values) => submit(ORDERS, { action: 'create', clientId, ...values }, t('draftOrderCreated'))}
      />
      <ReasonDialog
        open={dialog?.kind === 'cancel'}
        title={t('cancelOrder')}
        hint={t('cancelOrderHint')}
        label={t('failureReason')}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => (dialog?.kind === 'cancel' ? submit(ORDERS, { action: 'cancel', orderId: dialog.order.id, reason }, t('orderCancelled')) : Promise.resolve(null))}
      />
      <ReasonDialog
        open={dialog?.kind === 'fail'}
        title={t('markFailed')}
        hint={t('failDeliveryHint')}
        label={t('failureReason')}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => (dialog?.kind === 'fail' ? submit(DELIVERIES, { action: 'fail', noteId: dialog.note.id, reason }, t('deliveryFailedOk')) : Promise.resolve(null))}
      />
      <LinesDialog
        open={dialog?.kind === 'short' || dialog?.kind === 'return'}
        mode={dialog?.kind === 'return' ? 'return' : 'short'}
        note={dialog && (dialog.kind === 'short' || dialog.kind === 'return') ? dialog.note : null}
        onClose={() => setDialog(null)}
        onSubmit={(lines, reason) => {
          if (dialog?.kind === 'short') return submit(DELIVERIES, { action: 'deliver', noteId: dialog.note.id, shortages: lines.map((line) => ({ lineId: line.id, quantity: line.quantity })), reason }, t('shortDone'));
          if (dialog?.kind === 'return') return submit('/api/operations/returns', { action: 'create', noteId: dialog.note.id, reason, lines: lines.map((line) => ({ deliveryLineId: line.id, quantity: line.quantity })) }, t('returnRequestedOk'));
          return Promise.resolve(null);
        }}
      />
      <InvoiceDialog
        open={dialog?.kind === 'invoice'}
        onClose={() => setDialog(null)}
        onSubmit={(values) => (dialog?.kind === 'invoice' ? submit('/api/operations/invoices', { action: 'issue', noteId: dialog.note.id, ...values }, t('opInvoiceIssued')) : Promise.resolve(null))}
      />
    </div>
  );
}

function ReasonDialog({ open, title, hint, label, onClose, onSubmit }: {
  open: boolean; title: string; hint: string; label: string; onClose: () => void; onSubmit: (reason: string) => Promise<string | null>;
}) {
  const { t } = useLocale();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const failure = await onSubmit(reason.trim());
    setBusy(false);
    if (failure) setError(failure); else { setReason(''); setError(''); }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setError(''); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{hint}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-2">
          <Label className="grid gap-1 text-caption text-subtle">{label}<Textarea maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="button" variant="primary" disabled={busy || reason.trim() === ''} onClick={() => void save()}>{busy ? t('saving') : t('confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinesDialog({ open, mode, note, onClose, onSubmit }: {
  open: boolean;
  mode: 'short' | 'return';
  note: OpNote | null;
  onClose: () => void;
  onSubmit: (lines: { id: string; quantity: number }[], reason: string) => Promise<string | null>;
}) {
  const { t } = useLocale();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const max = (line: OpNote['lines'][number]) => (mode === 'return' ? line.returnable : line.quantity);
  const chosen = (note?.lines ?? [])
    .map((line) => ({ id: line.id, quantity: Number(quantities[line.id] ?? 0), max: max(line) }))
    .filter((line) => line.quantity > 0);
  const valid = chosen.length > 0 && chosen.every((line) => Number.isInteger(line.quantity) && line.quantity <= line.max) && reason.trim() !== '';

  async function save() {
    setBusy(true);
    const failure = await onSubmit(chosen.map(({ id, quantity }) => ({ id, quantity })), reason.trim());
    setBusy(false);
    if (failure) setError(failure); else { setQuantities({}); setReason(''); setError(''); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setError(''); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'return' ? t('opRecordReturn') : t('shortDeliver')}</DialogTitle>
          <DialogDescription>{mode === 'return' ? note?.documentNumber : t('shortHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          {(note?.lines ?? []).filter((line) => max(line) > 0).map((line) => (
            <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_96px] items-end gap-2">
              <span className="text-xs"><strong>{line.name}</strong><small className="block text-subtle">{line.sku} · {max(line)}</small></span>
              <Label className="grid gap-1 text-caption text-subtle">
                {mode === 'return' ? t('opReturnQty') : t('shortMissing')}
                <Input type="number" min={0} max={max(line)} step={1} value={quantities[line.id] ?? ''} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} />
              </Label>
            </div>
          ))}
          <Label className="grid gap-1 text-caption text-subtle">{t('shortReason')}<Textarea maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="button" variant="primary" disabled={!valid || busy} onClick={() => void save()}>{busy ? t('saving') : t('confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ open, onClose, onSubmit }: {
  open: boolean; onClose: () => void; onSubmit: (values: { taxRatePercent: number; dueDate: string | null }) => Promise<string | null>;
}) {
  const { t } = useLocale();
  const [tax, setTax] = useState('20');
  const [due, setDue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const rate = Number(tax);
  async function save() {
    setBusy(true);
    const failure = await onSubmit({ taxRatePercent: rate, dueDate: due || null });
    setBusy(false);
    setError(failure ?? '');
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setError(''); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('opIssueInvoice')}</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-3">
          <Label className="grid gap-1 text-caption text-subtle">{t('taxRatePercent')}<Input type="number" min={0} max={100} step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} /></Label>
          <Label className="grid gap-1 text-caption text-subtle">{t('dueDate')}<Input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Label>
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="button" variant="primary" disabled={busy || !Number.isFinite(rate) || rate < 0 || rate > 100} onClick={() => void save()}>{busy ? t('saving') : t('opIssueInvoice')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDialog({ open, products, locale, onClose, onSubmit }: {
  open: boolean;
  products: OpProduct[];
  locale: 'en' | 'ar';
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<string | null>;
}) {
  const { t } = useLocale();
  const [lines, setLines] = useState([{ key: 'l0', sizeId: '', quantity: '1' }]);
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = lines.map((line) => ({ sizeId: line.sizeId, quantity: Number(line.quantity) }));
  const valid = parsed.every((line) => line.sizeId && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 10000)
    && new Set(parsed.map((line) => line.sizeId)).size === parsed.length;
  const price = new Map(products.map((product) => [product.sizeId, product.priceMad]));
  const total = parsed.reduce((sum, line) => sum + (price.get(line.sizeId) ?? 0) * (Number.isFinite(line.quantity) ? line.quantity : 0), 0);

  async function save() {
    setBusy(true);
    const failure = await onSubmit({ lines: parsed, requestedDeliveryDate: date || null, priority, notes });
    setBusy(false);
    if (failure) return setError(failure);
    setLines([{ key: 'l0', sizeId: '', quantity: '1' }]);
    setDate(''); setPriority('normal'); setNotes(''); setError('');
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setError(''); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{t('opNewOrder')}</DialogTitle><DialogDescription>{t('newOrderHint')}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-3">
          {lines.map((line) => (
            <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-end gap-2">
              <OrderProductSelect products={products} value={line.sizeId} onChange={(value) => setLines((current) => current.map((entry) => (entry.key === line.key ? { ...entry, sizeId: value } : entry)))} />
              <Input type="number" min={1} max={10000} step={1} aria-label={t('quantity')} value={line.quantity} onChange={(event) => setLines((current) => current.map((entry) => (entry.key === line.key ? { ...entry, quantity: event.target.value } : entry)))} />
              <Button type="button" variant="ghost" size="icon" aria-label={t('removeLine')} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}><Trash2 size={16} /></Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), sizeId: '', quantity: '1' }])}><Plus size={14} />{t('addLine')}</Button>
          {products.length === 0 && <p className="m-0 text-caption text-destructive">{t('noPricedProducts')}</p>}
          {lines.map((line) => <ProductNotice key={`n-${line.key}`} product={products.find((product) => product.sizeId === line.sizeId)} />)}
          <div className="grid grid-cols-2 gap-3">
            <Label className="grid gap-1 text-caption text-subtle">{t('requestedDate')}<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Label>
            <Label className="grid gap-1 text-caption text-subtle">
              {t('priority')}
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="normal">{t('priorityNormal')}</SelectItem><SelectItem value="urgent">{t('priorityUrgent')}</SelectItem></SelectContent>
              </Select>
            </Label>
          </div>
          <Label className="grid gap-1 text-caption text-subtle">{t('orderNotes')}<Textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Label>
          <p className="m-0 text-xs font-bold text-foreground">{t('total')}: {formatMad(total, locale)}</p>
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="button" variant="primary" disabled={!valid || busy} onClick={() => void save()}>{busy ? t('saving') : t('createOrder')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
