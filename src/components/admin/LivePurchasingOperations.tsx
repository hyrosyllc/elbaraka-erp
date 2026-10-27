'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, PackageCheck, Plus, RotateCcw, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMad, formatStock, StockUnit } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

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

  return <section className="surface operations-surface">
    <div className="section-heading">
      <div><p className="section-kicker">{t('supplierOrders')}</p><h2>{t('purchaseOrders')}</h2></div>
      <Button variant="outline" onClick={() => void loadPurchasing()} disabled={loading}><RotateCcw size={15} />{t('retry')}</Button>
    </div>
    <p className="stock-hint"><PackageCheck size={15} />{t('purchasingWorkflowNote')}</p>
    {error && <div className="stock-hint" role="alert"><CircleAlert size={15} />{error}</div>}
    {notice && <p className="stock-hint" role="status"><Check size={15} />{notice}</p>}

    <form className="inventory-action-card" onSubmit={submitPurchaseOrder}>
      <h3>{t('createPurchaseOrder')}</h3>
      {data.suppliers.length === 0 || data.items.length === 0
        ? <p className="department-empty">{t(data.suppliers.length === 0 ? 'noSuppliers' : 'noInventoryItems')}</p>
        : <>
          <div className="inventory-actions-grid">
            <label className="field"><span>{t('supplier')}</span><Select value={supplierId || 'unselected'} onValueChange={(value) => setSupplierId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('supplier')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('supplier')}</SelectItem>{data.suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></label>
            <label className="field"><span>{t('purchaseOrderDate')}</span><Input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></label>
          </div>
          <div className="inventory-actions-grid">
            <label className="field"><span>{t('item')}</span><Select value={selectedItemId || 'unselected'} onValueChange={(value) => setSelectedItemId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('chooseItem')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('chooseItem')}</SelectItem>{data.items.filter((item) => !draftLines.some((line) => line.itemId === item.id)).map((item) => <SelectItem key={item.id} value={item.id}>{item.sku} · {item.name}</SelectItem>)}</SelectContent></Select></label>
            <label className="field"><span>{t('quantity')}</span><Input type="number" min="0.001" step={itemFor(selectedItemId)?.base_unit === 'each' ? '1' : '0.001'} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            <label className="field"><span>{t('unitCost')}</span><Input type="number" min="0" step="0.00001" value={unitCostMad} onChange={(event) => setUnitCostMad(event.target.value)} /></label>
            <Button type="button" variant="outline" onClick={addDraftLine} disabled={!selectedItemId || !quantity || unitCostMad === ''}><Plus size={15} />{t('addLine')}</Button>
          </div>
          {draftLines.length > 0 && <div className="department-record-list">{draftLines.map((line) => {
            const item = itemFor(line.itemId);
            return <div className="department-record" key={line.itemId}>
              <div><strong>{item?.name}</strong><small>{item?.sku}</small></div>
              <div><strong>{formatStock(Number(line.quantity), item?.base_unit ?? 'g', localeCode)}</strong><small>{formatMad(Number(line.unitCostMad), locale)} / {t('unitCost')}</small></div>
              <Button type="button" variant="outline" onClick={() => setDraftLines((current) => current.filter((entry) => entry.itemId !== line.itemId))} aria-label={t('removeLine')}><X size={15} /></Button>
            </div>;
          })}</div>}
          <div className="purchase-draft-controls">
            <div className="purchase-estimate"><small>{t('estimatedSpend')}</small><strong>{formatMad(draftTotal, locale)}</strong></div>
            <Button className="button button-primary" type="submit" disabled={saving || !supplierId || draftLines.length === 0}><Plus size={15} />{t('createPurchaseOrder')}</Button>
          </div>
        </>}
    </form>

    <section className="inventory-action-card">
      <h3>{t('purchaseOrders')}</h3>
      {loading ? <p className="department-empty" role="status">{t('loadingPurchaseOrders')}</p> : data.orders.length === 0
        ? <p className="department-empty">{t('noPurchaseOrders')}</p>
        : <div className="department-record-list">{data.orders.map((order) => {
          const lines = orderLines(order.id);
          return <article className="department-record live-purchase-order" key={order.id}>
            <div>
              <div className="operation-record-title"><strong>{order.document_number}</strong><span className={`status ${order.status === 'received' ? 'status-ready' : order.status === 'cancelled' ? 'status-empty' : 'status-warning'}`}>{t(order.status === 'part_received' ? 'partReceived' : order.status === 'cancelled' ? 'cancelledPurchaseOrder' : order.status)}</span></div>
              <h3>{order.supplier_name_snapshot}</h3>
              <small>{new Date(order.created_at).toLocaleDateString(localeCode)}{order.expected_at ? ` · ${t('purchaseOrderDate')}: ${order.expected_at}` : ''}</small>
            </div>
            <div className="department-record-lines">{lines.map((line) => {
              const item = itemFor(line.item_id);
              const remaining = Number(line.quantity_ordered) - Number(line.quantity_received);
              const canReceive = remaining > 0 && ['ordered', 'part_received'].includes(order.status);
              return <div className="operation-line live-purchase-line" key={line.id}>
                <span>{line.name_snapshot}<small>{formatStock(Number(line.quantity_received), item?.base_unit ?? 'g', localeCode)} / {formatStock(Number(line.quantity_ordered), item?.base_unit ?? 'g', localeCode)}</small></span>
                <strong>{formatMad(Number(line.unit_cost_mad), locale)}</strong>
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
            <div className="operation-record-action">
              {order.status === 'draft' && <Button className="button button-primary" onClick={() => void sendAction('order', { purchaseOrderId: order.id }, t('purchaseOrderPlaced'))} disabled={saving}><Send size={14} />{t('placeOrder')}</Button>}
              {['draft', 'ordered'].includes(order.status) && <Button variant="outline" onClick={() => void sendAction('cancel', { purchaseOrderId: order.id }, t('purchaseOrderCancelled'))} disabled={saving}><X size={14} />{t('cancelOrder')}</Button>}
            </div>
          </article>;
        })}</div>}
    </section>
  </section>;
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

  return <form className="receive-order-form" onSubmit={submit}>
    <Input aria-label={t('supplierDeliveryReference')} value={deliveryReference} onChange={(event) => setDeliveryReference(event.target.value)} placeholder={t('supplierDeliveryReference')} maxLength={120} />
    <label className="field"><span>{t('location')}</span><Select value={locationId || 'unselected'} onValueChange={(value) => setLocationId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('location')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('location')}</SelectItem>{allowedLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></label>
    <Input type="number" min="0.001" max={remaining} step={item?.base_unit === 'each' ? '1' : '0.001'} value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label={t('receiveQuantity')} required />
    {item?.track_lots && <>
      <Input aria-label={t('lotCode')} value={lotCode} onChange={(event) => setLotCode(event.target.value)} placeholder={t('lotCode')} maxLength={120} required />
      <Input aria-label={t('supplierLotCode')} value={supplierLotCode} onChange={(event) => setSupplierLotCode(event.target.value)} placeholder={t('supplierLotCode')} maxLength={120} />
      <Input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} aria-label={t('expiryDate')} />
      <label className="inventory-checkbox"><Checkbox checked={quarantine} onCheckedChange={(checked) => { setQuarantine(checked === true); setLocationId(''); }} /><span>{t('quarantineReceived')}</span></label>
    </>}
    <div className="operation-record-action"><Button className="button button-primary" type="submit" disabled={saving || !locationId}><PackageCheck size={14} />{t('receiveQuantity')}</Button><Button type="button" variant="outline" onClick={onCancel} disabled={saving}>{t('cancel')}</Button></div>
  </form>;
}
