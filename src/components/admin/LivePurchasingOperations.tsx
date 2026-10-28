'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, PackageCheck, Plus, RotateCcw, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMad, formatStock, StockUnit } from '@/lib/workspace';
import { useLocale } from './LocaleContext';
import { Label } from '@/components/ui/label';

type PurchaseSupplier = { id: string; name: string };
type PurchaseItem = { id: string; sku: string; name: string; base_unit: StockUnit; track_lots: boolean };
type ReceivingLocation = { id: string; code: string; name: string; location_type: string };
type PurchaseOrder = {
  id: string;
  document_number: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  status: 'draft' | 'ordered' | 'part_received' | 'received' | 'cancelled';
  expected_at: string | null;
  created_at: string;
};
type PurchaseOrderLine = {
  id: string;
  purchase_order_id: string;
  item_id: string;
  sku_snapshot: string;
  name_snapshot: string;
  quantity_ordered: number | string;
  quantity_received: number | string;
  unit_cost_mad: number | string;
};
type PurchaseData = {
  orders: PurchaseOrder[];
  lines: PurchaseOrderLine[];
  suppliers: PurchaseSupplier[];
  items: PurchaseItem[];
  locations: ReceivingLocation[];
};
type DraftLine = { itemId: string; quantity: string; unitCostMad: string };

const EMPTY_DATA: PurchaseData = { orders: [], lines: [], suppliers: [], items: [], locations: [] };

export function LivePurchasingOperations() {
  const { t, locale } = useLocale();
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCostMad, setUnitCostMad] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [receivingLineId, setReceivingLineId] = useState('');
  const [quotes, setQuotes] = useState<Map<string, number>>(new Map());
  const [prefilled, setPrefilled] = useState(false);

  // Suggest the supplier's marketplace price (per base unit) for the chosen item.
  useEffect(() => {
    void fetch('/api/operations/marketplace', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { materials: { id: string; unit: 'kg' | 'each'; suppliers: { supplierId: string | null; price: number }[] }[] };
      const map = new Map<string, number>();
      for (const material of result.materials) {
        for (const quote of material.suppliers) {
          if (quote.supplierId) map.set(`${material.id}|${quote.supplierId}`, quote.price / (material.unit === 'kg' ? 1000 : 1));
        }
      }
      setQuotes(map);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const suggested = quotes.get(`${selectedItemId}|${supplierId}`);
    if (suggested !== undefined && (unitCostMad === '' || prefilled)) {
      setUnitCostMad(String(Math.round(suggested * 100_000) / 100_000));
      setPrefilled(true);
    } else if (prefilled) {
      setUnitCostMad('');
      setPrefilled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId, supplierId, quotes]);

  const loadPurchasing = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/operations/purchasing', { cache: 'no-store' });
      const result = await response.json() as Partial<PurchaseData> & { error?: string };
      if (!response.ok || !Array.isArray(result.orders) || !Array.isArray(result.lines)) {
        throw new Error(result.error || 'Could not load live purchasing data.');
      }
      const loaded = {
        orders: result.orders,
        lines: result.lines,
        suppliers: result.suppliers ?? [],
        items: result.items ?? [],
        locations: result.locations ?? [],
      };
      setData(loaded);
      setSupplierId((current) => current || loaded.suppliers[0]?.id || '');
      setSelectedItemId((current) => current || loaded.items[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load live purchasing data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPurchasing();
  }, []);

  const draftTotal = useMemo(() => draftLines.reduce(
    (total, line) => total + Number(line.quantity || 0) * Number(line.unitCostMad || 0),
    0,
  ), [draftLines]);
  const localeCode = locale === 'ar' ? 'ar-MA' : 'en-MA';

  const sendAction = async (action: string, fields: Record<string, unknown>, successMessage: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/operations/purchasing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...fields }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The purchasing action could not be completed.');
      setNotice(successMessage);
      await loadPurchasing();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The purchasing action could not be completed.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addDraftLine = () => {
    const item = data.items.find((candidate) => candidate.id === selectedItemId);
    const parsedQuantity = Number(quantity);
    const parsedCost = Number(unitCostMad);
    if (
      !item
      || !Number.isFinite(parsedQuantity)
      || parsedQuantity <= 0
      || (item.base_unit === 'each' && !Number.isInteger(parsedQuantity))
      || !Number.isFinite(parsedCost)
      || parsedCost < 0
      || draftLines.some((line) => line.itemId === item.id)
    ) return;

    setDraftLines((current) => [...current, {
      itemId: item.id,
      quantity: String(parsedQuantity),
      unitCostMad: String(parsedCost),
    }]);
    setQuantity('');
    setUnitCostMad('');
    const nextItem = data.items.find((candidate) => candidate.id !== item.id);
    setSelectedItemId(nextItem?.id ?? '');
  };

  const submitPurchaseOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supplierId || draftLines.length === 0) return;
    const created = await sendAction('create', {
      supplierId,
      expectedAt: expectedAt || null,
      idempotencyKey: crypto.randomUUID(),
      lines: draftLines.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        unitCostMad: Number(line.unitCostMad),
      })),
    }, t('purchaseOrderCreated'));
    if (created) {
      setExpectedAt('');
      setDraftLines([]);
    }
  };

  const orderLines = (purchaseOrderId: string) => data.lines.filter((line) => line.purchase_order_id === purchaseOrderId);
  const itemFor = (id: string) => data.items.find((item) => item.id === id);

  return <Card className="p-4 sm:p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div><p className="m-0 text-caption font-bold text-muted-foreground">{t('supplierOrders')}</p><h2 className="mt-1 text-base font-bold tracking-tight text-foreground">{t('purchaseOrders')}</h2></div>
      <Button variant="outline" onClick={() => void loadPurchasing()} disabled={loading}><RotateCcw size={15} />{t('retry')}</Button>
    </div>
    <p className="mb-3 flex items-start gap-2 rounded-md border border-accent-border bg-accent p-2.5 text-xs leading-relaxed text-accent-foreground"><PackageCheck size={15} className="mt-0.5 shrink-0" />{t('purchasingWorkflowNote')}</p>
    {error && <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-soft p-2.5 text-xs leading-relaxed text-destructive" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" />{error}</div>}
    {notice && <p className="mb-3 flex items-start gap-2 rounded-md border border-success/40 bg-secondary p-2.5 text-xs leading-relaxed text-secondary-foreground" role="status"><Check size={15} className="mt-0.5 shrink-0" />{notice}</p>}

    <form className="grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-4" onSubmit={submitPurchaseOrder}>
      <h3 className="m-0 text-sm font-bold text-foreground">{t('createPurchaseOrder')}</h3>
      {data.suppliers.length === 0 || data.items.length === 0
        ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{t(data.suppliers.length === 0 ? 'noSuppliers' : 'noInventoryItems')}</p>
        : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('supplier')}</span><Select value={supplierId || 'unselected'} onValueChange={(value) => setSupplierId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('supplier')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('supplier')}</SelectItem>{data.suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></Label>
            <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('purchaseOrderDate')}</span><Input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('item')}</span><Select value={selectedItemId || 'unselected'} onValueChange={(value) => setSelectedItemId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('chooseItem')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('chooseItem')}</SelectItem>{data.items.filter((item) => !draftLines.some((line) => line.itemId === item.id)).map((item) => <SelectItem key={item.id} value={item.id}>{item.sku} · {item.name}</SelectItem>)}</SelectContent></Select></Label>
            <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('quantity')}</span><Input type="number" min="0.001" step={itemFor(selectedItemId)?.base_unit === 'each' ? '1' : '0.001'} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Label>
            <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('unitCost')}</span><Input type="number" min="0" step="0.00001" value={unitCostMad} onChange={(event) => { setUnitCostMad(event.target.value); setPrefilled(false); }} /></Label>
            <Button type="button" variant="outline" onClick={addDraftLine} disabled={!selectedItemId || !quantity || unitCostMad === ''}><Plus size={15} />{t('addLine')}</Button>
          </div>
          {draftLines.length > 0 && <div className="divide-y divide-border">{draftLines.map((line) => {
            const item = itemFor(line.itemId);
            return <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={line.itemId}>
              <div className="grid gap-1"><strong className="text-sm">{item?.name}</strong><small className="text-xs text-muted-foreground">{item?.sku}</small></div>
              <div className="grid gap-1 text-end"><strong className="text-sm">{formatStock(Number(line.quantity), item?.base_unit ?? 'g', localeCode)}</strong><small className="text-xs text-muted-foreground">{formatMad(Number(line.unitCostMad), locale)} / {t('unitCost')}</small></div>
              <Button type="button" variant="outline" onClick={() => setDraftLines((current) => current.filter((entry) => entry.itemId !== line.itemId))} aria-label={t('removeLine')}><X size={15} /></Button>
            </div>;
          })}</div>}
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
            <div className="grid gap-1"><small className="text-xs text-muted-foreground">{t('estimatedSpend')}</small><strong className="text-lg font-bold text-foreground">{formatMad(draftTotal, locale)}</strong></div>
            <Button variant="primary" type="submit" disabled={saving || !supplierId || draftLines.length === 0}><Plus size={15} />{t('createPurchaseOrder')}</Button>
          </div>
        </>}
    </form>

    <section className="mt-3 grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-4">
      <h3 className="m-0 text-sm font-bold text-foreground">{t('purchaseOrders')}</h3>
      {loading ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground" role="status">{t('loadingPurchaseOrders')}</p> : data.orders.length === 0
        ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{t('noPurchaseOrders')}</p>
        : <div className="divide-y divide-border">{data.orders.map((order) => {
          const lines = orderLines(order.id);
          return <article className="grid min-w-0 gap-3 py-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]" key={order.id}>
            <div>
              <div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-xs font-medium text-muted-foreground">{order.document_number}</strong><Badge variant={order.status === 'received' ? 'success' : order.status === 'cancelled' ? 'destructive' : 'warning'}>{t(order.status === 'part_received' ? 'partReceived' : order.status === 'cancelled' ? 'cancelledPurchaseOrder' : order.status)}</Badge></div>
              <h3 className="mb-1 mt-2 text-sm font-bold text-foreground">{order.supplier_name_snapshot}</h3>
              <small className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString(localeCode)}{order.expected_at ? ` · ${t('purchaseOrderDate')}: ${order.expected_at}` : ''}</small>
            </div>
            <div className="grid gap-2">{lines.map((line) => {
              const item = itemFor(line.item_id);
              const remaining = Number(line.quantity_ordered) - Number(line.quantity_received);
              const canReceive = remaining > 0 && ['ordered', 'part_received'].includes(order.status);
              return <div className="grid items-center gap-2 border-b border-border py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" key={line.id}>
                <span className="grid gap-1 text-sm text-foreground">{line.name_snapshot}<small className="text-xs text-muted-foreground">{formatStock(Number(line.quantity_received), item?.base_unit ?? 'g', localeCode)} / {formatStock(Number(line.quantity_ordered), item?.base_unit ?? 'g', localeCode)}</small></span>
                <strong className="whitespace-nowrap text-xs font-medium text-muted-foreground">{formatMad(Number(line.unit_cost_mad), locale)}</strong>
                {canReceive && <Button variant="outline" onClick={() => setReceivingLineId((current) => current === line.id ? '' : line.id)}>{t(receivingLineId === line.id ? 'cancel' : 'receiveQuantity')}</Button>}
                {receivingLineId === line.id && <ReceiveOrderLine
                  item={item}
                  line={line}
                  locations={data.locations}
                  remaining={remaining}
                  saving={saving}
                  onCancel={() => setReceivingLineId('')}
                  onSubmit={async (payload) => {
                    const received = await sendAction('receive', payload, t('receiptCreated'));
                    if (received) setReceivingLineId('');
                  }}
                  orderId={order.id}
                />}
              </div>;
            })}</div>
            <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
              {order.status === 'draft' && <Button variant="primary" onClick={() => void sendAction('order', { purchaseOrderId: order.id }, t('purchaseOrderPlaced'))} disabled={saving}><Send size={14} />{t('placeOrder')}</Button>}
              {['draft', 'ordered'].includes(order.status) && <Button variant="outline" onClick={() => void sendAction('cancel', { purchaseOrderId: order.id }, t('purchaseOrderCancelled'))} disabled={saving}><X size={14} />{t('cancelOrder')}</Button>}
            </div>
          </article>;
        })}</div>}
    </section>
  </Card>;
}

function ReceiveOrderLine({
  item,
  line,
  locations,
  remaining,
  saving,
  onCancel,
  onSubmit,
  orderId,
}: {
  item: PurchaseItem | undefined;
  line: PurchaseOrderLine;
  locations: ReceivingLocation[];
  remaining: number;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  orderId: string;
}) {
  const { t } = useLocale();
  const [locationId, setLocationId] = useState('');
  const [quantity, setQuantity] = useState(String(remaining));
  const [deliveryReference, setDeliveryReference] = useState('');
  const [lotCode, setLotCode] = useState('');
  const [supplierLotCode, setSupplierLotCode] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [quarantine, setQuarantine] = useState(false);
  const allowedLocations = locations.filter((location) => item?.track_lots
    ? quarantine
      ? location.location_type === 'quarantine'
      : location.location_type !== 'quarantine'
    : location.location_type !== 'quarantine');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (!locationId || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > remaining) return;
    if (item?.base_unit === 'each' && !Number.isInteger(parsedQuantity)) return;
    if (item?.track_lots && !lotCode.trim()) return;
    void onSubmit({
      purchaseOrderId: orderId,
      deliveryReference,
      idempotencyKey: crypto.randomUUID(),
      lines: [{
        purchaseOrderLineId: line.id,
        locationId,
        quantity: parsedQuantity,
        lotCode: item?.track_lots ? lotCode.trim() : '',
        supplierLotCode: item?.track_lots ? supplierLotCode.trim() : '',
        expiresOn: item?.track_lots ? expiresOn || null : null,
        quarantine: item?.track_lots ? quarantine : false,
      }],
    });
  };

  return <form className="col-span-full grid min-w-0 gap-3 rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-2" onSubmit={submit}>
    <Input aria-label={t('supplierDeliveryReference')} value={deliveryReference} onChange={(event) => setDeliveryReference(event.target.value)} placeholder={t('supplierDeliveryReference')} maxLength={120} />
    <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('location')}</span><Select value={locationId || 'unselected'} onValueChange={(value) => setLocationId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('location')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('location')}</SelectItem>{allowedLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></Label>
    <Input type="number" min="0.001" max={remaining} step={item?.base_unit === 'each' ? '1' : '0.001'} value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label={t('receiveQuantity')} required />
    {item?.track_lots && <>
      <Input aria-label={t('lotCode')} value={lotCode} onChange={(event) => setLotCode(event.target.value)} placeholder={t('lotCode')} maxLength={120} required />
      <Input aria-label={t('supplierLotCode')} value={supplierLotCode} onChange={(event) => setSupplierLotCode(event.target.value)} placeholder={t('supplierLotCode')} maxLength={120} />
      <Input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} aria-label={t('expiryDate')} />
      <Label className="flex min-h-9 items-center gap-2 text-sm text-foreground"><Checkbox checked={quarantine} onCheckedChange={(checked) => { setQuarantine(checked === true); setLocationId(''); }} /><span>{t('quarantineReceived')}</span></Label>
    </>}
    <div className="col-span-full flex flex-wrap gap-2"><Button variant="primary" type="submit" disabled={saving || !locationId}><PackageCheck size={14} />{t('receiveQuantity')}</Button><Button type="button" variant="outline" onClick={onCancel} disabled={saving}>{t('cancel')}</Button></div>
  </form>;
}
