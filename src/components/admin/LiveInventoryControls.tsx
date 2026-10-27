'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, PackageCheck, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatStock, StockUnit } from '@/lib/workspace';
import { useLocale } from './LocaleContext';
import { Label } from '@/components/ui/label';

type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  item_type: string;
  base_unit: StockUnit;
  net_weight_g: number | string | null;
  track_lots: boolean;
  reorder_point: number | string;
  is_active: boolean;
};

type InventoryLocation = {
  id: string;
  code: string;
  name: string;
  location_type: string;
  is_active: boolean;
};

type InventoryLot = {
  id: string;
  item_id: string;
  lot_code: string;
  supplier_lot_code: string | null;
  expires_on: string | null;
  lot_status: string;
};

type Adjustment = {
  id: string;
  item_id: string;
  location_id: string;
  lot_id: string | null;
  quantity_delta: number | string;
  reason: string;
  status: string;
  requested_by: string;
  review_note: string;
  created_at: string;
};

type Transfer = {
  id: string;
  document_number: string;
  item_id: string;
  lot_id: string | null;
  from_location_id: string;
  to_location_id: string;
  quantity: number | string;
  reason: string;
  created_at: string;
};

type InventorySetup = {
  items: InventoryItem[];
  locations: InventoryLocation[];
  lots: InventoryLot[];
  adjustments: Adjustment[];
  transfers: Transfer[];
  canConfigure: boolean;
  canReview: boolean;
  currentUserId: string;
};

const EMPTY_SETUP: InventorySetup = {
  items: [],
  locations: [],
  lots: [],
  adjustments: [],
  transfers: [],
  canConfigure: false,
  canReview: false,
  currentUserId: '',
};

const ITEM_TYPES = ['raw_material', 'blend', 'packaging', 'finished_good'] as const;
const LOCATION_TYPES = ['warehouse', 'production', 'quarantine'] as const;

export function LiveInventoryControls({ onChanged }: { onChanged: () => void }) {
  const { t, locale } = useLocale();
  const [setup, setSetup] = useState(EMPTY_SETUP);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<(typeof ITEM_TYPES)[number]>('raw_material');
  const [trackLots, setTrackLots] = useState(true);
  const [reorderPoint, setReorderPoint] = useState('0');
  const [netWeightG, setNetWeightG] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationType, setLocationType] = useState<(typeof LOCATION_TYPES)[number]>('warehouse');

  const [transferItemId, setTransferItemId] = useState('');
  const [transferLotId, setTransferLotId] = useState('');
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferReason, setTransferReason] = useState('');

  const [adjustmentItemId, setAdjustmentItemId] = useState('');
  const [adjustmentLotId, setAdjustmentLotId] = useState('');
  const [adjustmentLocationId, setAdjustmentLocationId] = useState('');
  const [quantityDelta, setQuantityDelta] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const activeItems = useMemo(() => setup.items.filter((item) => item.is_active), [setup.items]);
  const activeLocations = useMemo(() => setup.locations.filter((location) => location.is_active), [setup.locations]);
  const selectedTransferItem = activeItems.find((item) => item.id === transferItemId);
  const selectedAdjustmentItem = activeItems.find((item) => item.id === adjustmentItemId);
  const transferLots = setup.lots.filter((lot) => lot.item_id === transferItemId && !['closed', 'expired'].includes(lot.lot_status));
  const adjustmentLots = setup.lots.filter((lot) => lot.item_id === adjustmentItemId && !['closed', 'expired'].includes(lot.lot_status));
  const selectedTransferLot = transferLots.find((lot) => lot.id === transferLotId);
  const selectedAdjustmentLot = adjustmentLots.find((lot) => lot.id === adjustmentLotId);
  const transferLocations = activeLocations.filter((location) => {
    if (location.location_type === 'customer' || location.location_type === 'transit') return false;
    return selectedTransferLot?.lot_status === 'quarantined'
      ? location.location_type === 'quarantine'
      : location.location_type !== 'quarantine';
  });
  const adjustmentLocations = activeLocations.filter((location) => {
    if (location.location_type === 'customer' || location.location_type === 'transit') return false;
    return selectedAdjustmentLot?.lot_status === 'quarantined'
      ? location.location_type === 'quarantine'
      : location.location_type !== 'quarantine';
  });

  const loadSetup = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/operations/inventory/setup', { cache: 'no-store' });
      const result = await response.json() as Partial<InventorySetup> & { error?: string };
      if (!response.ok || !Array.isArray(result.items) || !Array.isArray(result.locations)) {
        throw new Error(result.error || 'Could not load live inventory setup.');
      }
      setSetup({
        items: result.items,
        locations: result.locations,
        lots: result.lots ?? [],
        adjustments: result.adjustments ?? [],
        transfers: result.transfers ?? [],
        canConfigure: result.canConfigure ?? false,
        canReview: result.canReview ?? false,
        currentUserId: result.currentUserId ?? '',
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load live inventory setup.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSetup();
  }, []);

  const sendAction = async (action: string, fields: Record<string, unknown>, successMessage: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/operations/inventory/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...fields }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The inventory action could not be completed.');
      setNotice(successMessage);
      await Promise.all([loadSetup(), Promise.resolve(onChanged())]);
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The inventory action could not be completed.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const baseUnit: StockUnit = itemType === 'raw_material' || itemType === 'blend' ? 'g' : 'each';
    const ok = await sendAction('create-item', {
      sku, name, itemType, baseUnit, trackLots,
      reorderPoint: Number(reorderPoint),
      netWeightG: itemType === 'finished_good' ? Number(netWeightG) : null,
    }, t('inventoryItemCreated'));
    if (ok) {
      setSku('');
      setName('');
      setReorderPoint('0');
      setNetWeightG('');
    }
  };

  const submitLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await sendAction('create-location', { code: locationCode, name: locationName, locationType }, t('inventoryLocationCreated'));
    if (ok) {
      setLocationCode('');
      setLocationName('');
    }
  };

  const submitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedTransferItem?.track_lots && !transferLotId) return;
    const ok = await sendAction('transfer', {
      itemId: transferItemId,
      lotId: selectedTransferItem?.track_lots ? transferLotId : null,
      fromLocationId,
      toLocationId,
      quantity: Number(transferQuantity),
      reason: transferReason,
      idempotencyKey: crypto.randomUUID(),
    }, t('inventoryTransferCreated'));
    if (ok) {
      setTransferQuantity('');
      setTransferReason('');
    }
  };

  const submitAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedAdjustmentItem?.track_lots && !adjustmentLotId) return;
    const ok = await sendAction('request-adjustment', {
      itemId: adjustmentItemId,
      locationId: adjustmentLocationId,
      lotId: selectedAdjustmentItem?.track_lots ? adjustmentLotId : null,
      quantityDelta: Number(quantityDelta),
      reason: adjustmentReason,
      idempotencyKey: crypto.randomUUID(),
    }, t('adjustmentSubmitted'));
    if (ok) {
      setQuantityDelta('');
      setAdjustmentReason('');
    }
  };

  const review = async (adjustment: Adjustment, approve: boolean) => {
    const ok = await sendAction('review-adjustment', {
      requestId: adjustment.id,
      approve,
      reviewNote: reviewNotes[adjustment.id] ?? '',
    }, approve ? t('adjustmentApproved') : t('adjustmentRejected'));
    if (ok) {
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[adjustment.id];
        return next;
      });
    }
  };

  const itemName = (id: string) => setup.items.find((item) => item.id === id)?.name ?? t('item');
  const locationNameById = (id: string) => setup.locations.find((location) => location.id === id)?.name ?? t('location');
  const localeCode = locale === 'ar' ? 'ar-MA' : 'en-MA';

  return <Card className="p-4 sm:p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div><p className="m-0 text-caption font-bold text-muted-foreground">{t('navInventory')}</p><h2 className="mt-1 text-base font-bold tracking-tight text-foreground">{t('inventorySetup')}</h2></div>
      <Button variant="outline" onClick={() => void loadSetup()} disabled={loading}><RotateCcw size={15} />{t('retry')}</Button>
    </div>
    {error && <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs leading-relaxed text-red-900" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" />{error}</div>}
    {notice && <p className="mb-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs leading-relaxed text-emerald-900" role="status"><Check size={15} className="mt-0.5 shrink-0" />{notice}</p>}

    {setup.canConfigure && <div className="grid gap-3 md:grid-cols-2">
      <form className="grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-4" onSubmit={submitItem}>
        <h3 className="m-0 text-sm font-bold text-foreground">{t('createInventoryItem')}</h3>
        <Input aria-label={t('itemCode')} value={sku} onChange={(event) => setSku(event.target.value)} placeholder={t('itemCode')} maxLength={64} required />
        <Input aria-label={t('itemName')} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('itemName')} maxLength={160} required />
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('type')}</span><Select value={itemType} onValueChange={(value) => { if (ITEM_TYPES.includes(value as (typeof ITEM_TYPES)[number])) setItemType(value as (typeof ITEM_TYPES)[number]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ITEM_TYPES.map((type) => <SelectItem key={type} value={type}>{t(type === 'raw_material' ? 'rawMaterial' : type === 'finished_good' ? 'finishedGood' : type)}</SelectItem>)}</SelectContent></Select></Label>
        <Input aria-label={t('reorderPoint')} type="number" min="0" step="0.001" value={reorderPoint} onChange={(event) => setReorderPoint(event.target.value)} placeholder={t('reorderPoint')} required />
        {itemType === 'finished_good' && <Input aria-label={t('netWeight')} type="number" min="0.001" step="0.001" value={netWeightG} onChange={(event) => setNetWeightG(event.target.value)} placeholder={t('netWeight')} required />}
        <Label className="flex min-h-9 items-center gap-2 text-sm text-foreground"><Checkbox checked={trackLots} onCheckedChange={(checked) => setTrackLots(checked === true)} /><span>{t('trackLots')}</span></Label>
        <Button variant="primary" type="submit" disabled={saving}><Plus size={15} />{t('createInventoryItem')}</Button>
      </form>

      <form className="grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-4" onSubmit={submitLocation}>
        <h3 className="m-0 text-sm font-bold text-foreground">{t('createInventoryLocation')}</h3>
        <Input aria-label={t('locationCode')} value={locationCode} onChange={(event) => setLocationCode(event.target.value)} placeholder={t('locationCode')} maxLength={40} required />
        <Input aria-label={t('locationName')} value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder={t('locationName')} maxLength={160} required />
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('locationType')}</span><Select value={locationType} onValueChange={(value) => { if (LOCATION_TYPES.includes(value as (typeof LOCATION_TYPES)[number])) setLocationType(value as (typeof LOCATION_TYPES)[number]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LOCATION_TYPES.map((type) => <SelectItem key={type} value={type}>{t(type === 'warehouse' ? 'warehouse' : type === 'production' ? 'productionLocation' : 'quarantineLocation')}</SelectItem>)}</SelectContent></Select></Label>
        <Button variant="primary" type="submit" disabled={saving}><Plus size={15} />{t('createInventoryLocation')}</Button>
      </form>
    </div>}

    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <form className="grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-4" onSubmit={submitTransfer}>
        <h3 className="m-0 text-sm font-bold text-foreground">{t('transferStock')}</h3>
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('item')}</span><Select value={transferItemId || 'unselected'} onValueChange={(value) => { setTransferItemId(value === 'unselected' ? '' : value); setTransferLotId(''); setFromLocationId(''); setToLocationId(''); }}><SelectTrigger><SelectValue placeholder={t('chooseItem')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('chooseItem')}</SelectItem>{activeItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.sku} · {item.name}</SelectItem>)}</SelectContent></Select></Label>
        {selectedTransferItem?.track_lots && <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('lotCode')}</span><Select value={transferLotId || 'unselected'} onValueChange={(value) => { setTransferLotId(value === 'unselected' ? '' : value); setFromLocationId(''); setToLocationId(''); }}><SelectTrigger><SelectValue placeholder={t('lotCode')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('lotCode')}</SelectItem>{transferLots.map((lot) => <SelectItem key={lot.id} value={lot.id}>{lot.lot_code} · {t(lot.lot_status === 'quarantined' ? 'quarantined' : 'available')}</SelectItem>)}</SelectContent></Select></Label>}
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('sourceLocation')}</span><Select value={fromLocationId || 'unselected'} onValueChange={(value) => { const next = value === 'unselected' ? '' : value; setFromLocationId(next); if (next === toLocationId) setToLocationId(''); }}><SelectTrigger><SelectValue placeholder={t('sourceLocation')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('sourceLocation')}</SelectItem>{transferLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></Label>
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('destinationLocation')}</span><Select value={toLocationId || 'unselected'} onValueChange={(value) => setToLocationId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('destinationLocation')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('destinationLocation')}</SelectItem>{transferLocations.filter((location) => location.id !== fromLocationId).map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></Label>
        <Input aria-label={t('quantity')} type="number" min="0.001" step={selectedTransferItem?.base_unit === 'each' ? '1' : '0.001'} value={transferQuantity} onChange={(event) => setTransferQuantity(event.target.value)} placeholder={t('quantity')} required />
        <Input aria-label={t('transferReason')} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder={t('transferReason')} maxLength={500} required />
        <Button variant="primary" type="submit" disabled={saving || !transferItemId || !fromLocationId || !toLocationId || Boolean(selectedTransferItem?.track_lots && !transferLotId)}><PackageCheck size={15} />{t('transferStock')}</Button>
      </form>

      <form className="grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-4" onSubmit={submitAdjustment}>
        <h3 className="m-0 text-sm font-bold text-foreground">{t('requestAdjustment')}</h3>
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('item')}</span><Select value={adjustmentItemId || 'unselected'} onValueChange={(value) => { setAdjustmentItemId(value === 'unselected' ? '' : value); setAdjustmentLotId(''); setAdjustmentLocationId(''); }}><SelectTrigger><SelectValue placeholder={t('chooseItem')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('chooseItem')}</SelectItem>{activeItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.sku} · {item.name}</SelectItem>)}</SelectContent></Select></Label>
        {selectedAdjustmentItem?.track_lots && <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('lotCode')}</span><Select value={adjustmentLotId || 'unselected'} onValueChange={(value) => { setAdjustmentLotId(value === 'unselected' ? '' : value); setAdjustmentLocationId(''); }}><SelectTrigger><SelectValue placeholder={t('lotCode')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('lotCode')}</SelectItem>{adjustmentLots.map((lot) => <SelectItem key={lot.id} value={lot.id}>{lot.lot_code} · {t(lot.lot_status === 'quarantined' ? 'quarantined' : 'available')}</SelectItem>)}</SelectContent></Select></Label>}
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{t('location')}</span><Select value={adjustmentLocationId || 'unselected'} onValueChange={(value) => setAdjustmentLocationId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('location')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('location')}</SelectItem>{adjustmentLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></Label>
        <Input aria-label={t('quantityChange')} type="number" step={selectedAdjustmentItem?.base_unit === 'each' ? '1' : '0.001'} value={quantityDelta} onChange={(event) => setQuantityDelta(event.target.value)} placeholder={t('quantityChange')} required />
        <Input aria-label={t('adjustmentReason')} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder={t('adjustmentReason')} maxLength={500} required />
        <Button variant="primary" type="submit" disabled={saving || !adjustmentItemId || !adjustmentLocationId || Boolean(selectedAdjustmentItem?.track_lots && !adjustmentLotId)}><Plus size={15} />{t('requestAdjustment')}</Button>
      </form>
    </div>

    <section className="mt-3 grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-4">
      <h3 className="m-0 text-sm font-bold text-foreground">{t('adjustmentReview')}</h3>
      {loading ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground" role="status">{t('loadingInventory')}</p> : setup.adjustments.filter((adjustment) => adjustment.status === 'pending').length === 0
        ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{t('noPendingAdjustments')}</p>
        : <div className="divide-y divide-border">{setup.adjustments.filter((adjustment) => adjustment.status === 'pending').map((adjustment) => {
          const ownRequest = adjustment.requested_by === setup.currentUserId;
          return <article className="grid min-w-0 items-center gap-3 py-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]" key={adjustment.id}>
            <div className="grid gap-1"><strong className="text-sm">{itemName(adjustment.item_id)}</strong><small className="text-xs text-muted-foreground">{locationNameById(adjustment.location_id)} · {new Date(adjustment.created_at).toLocaleString(localeCode)}</small></div>
            <div className="grid gap-1 text-xs text-muted-foreground"><span>{t('quantityChange')}</span><strong className="text-sm text-foreground">{formatStock(Number(adjustment.quantity_delta), setup.items.find((item) => item.id === adjustment.item_id)?.base_unit ?? 'each', localeCode)}</strong></div>
            <div className="grid gap-2"><p className="m-0 text-sm text-muted-foreground">{adjustment.reason}</p>{setup.canReview && <Input aria-label={t('reviewNote')} value={reviewNotes[adjustment.id] ?? ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [adjustment.id]: event.target.value }))} placeholder={t('reviewNote')} maxLength={500} />}</div>
            {setup.canReview && <div className="flex flex-wrap justify-end gap-2">
              <Button variant="primary" onClick={() => void review(adjustment, true)} disabled={saving || ownRequest}><Check size={14} />{t('approve')}</Button>
              <Button variant="outline" onClick={() => void review(adjustment, false)} disabled={saving || ownRequest || (reviewNotes[adjustment.id] ?? '').trim().length < 5}>{t('reject')}</Button>
            </div>}
          </article>;
        })}</div>}
    </section>

    <section className="mt-3 grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-4">
      <h3 className="m-0 text-sm font-bold text-foreground">{t('stockTransferIn')}</h3>
      {setup.transfers.length === 0 ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{t('noTransfers')}</p> : <div className="divide-y divide-border">{setup.transfers.map((transfer) => (
        <article className="grid min-w-0 gap-2 py-3 sm:grid-cols-2" key={transfer.id}>
          <div className="grid gap-1"><strong className="text-sm">{transfer.document_number}</strong><small className="text-xs text-muted-foreground">{itemName(transfer.item_id)} · {new Date(transfer.created_at).toLocaleString(localeCode)}</small></div>
          <div className="grid gap-1"><strong className="text-sm">{formatStock(Number(transfer.quantity), setup.items.find((item) => item.id === transfer.item_id)?.base_unit ?? 'each', localeCode)}</strong><small className="text-xs text-muted-foreground">{locationNameById(transfer.from_location_id)} → {locationNameById(transfer.to_location_id)}</small></div>
          <small className="text-xs text-muted-foreground">{transfer.reason}</small>
        </article>
      ))}</div>}
    </section>
  </Card>;
}
