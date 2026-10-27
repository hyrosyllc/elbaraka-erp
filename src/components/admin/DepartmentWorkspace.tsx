'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, ClipboardList, List, MapPinned, PackageCheck, Pencil, Plus, ReceiptText, RotateCcw, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useLocale } from './LocaleContext';
import {
  ClientAccount,
  CustomerReturn,
  PurchaseOrderLine,
  RoleAccess,
  Supplier,
  WorkspaceData,
  WorkspacePage,
  WorkspaceRole,
  WORKSPACE_PAGES,
  formatMad,
  formatStock,
} from '@/lib/workspace';
import {
  calculateFinishedProductionNeeds,
  calculateProductionRequirements,
  calculatePurchaseNeeds,
} from '@/lib/operations';
import { PAGE_LABEL_KEYS, ROLE_LABEL_KEYS, TranslationKey } from '@/lib/i18n';
import { ClientLocationMap } from './ClientLocationMap';
import type { ClientMapLocation } from './ClientLocationMap';
import { LiveInventoryControls } from './LiveInventoryControls';
import { LivePurchasingOperations } from './LivePurchasingOperations';

function dateLabel(iso: string, locale: 'en' | 'ar') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'en-MA', { dateStyle: 'medium' }).format(new Date(iso));
}

function SectionHeading({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) {
  return <div className="section-heading"><div><p className="section-kicker">{eyebrow}</p><h2>{title}</h2></div>{count !== undefined && <span className="status status-neutral">{count}</span>}</div>;
}

function PreviewInventoryDepartment({ data }: { data: WorkspaceData }) {
  const { t, locale } = useLocale();
  const movementItems = [...data.movements].reverse().slice(0, 8);
  return (
    <div className="department-stack">
      <section className="surface operations-surface">
        <SectionHeading eyebrow={t('navInventory')} title={t('inventorySubtitle')} count={data.items.filter((item) => item.active).length} />
        <div className="department-table-wrap"><table className="department-table"><thead><tr><th>{t('item')}</th><th>{t('type')}</th><th>{t('onHand')}</th><th>{t('reserved')}</th><th>{t('quarantined')}</th><th>{t('available')}</th><th>{t('reorderAt')}</th></tr></thead><tbody>
          {data.items.filter((item) => item.active).map((item) => {
            const reserved = data.orders.filter((order) => order.status === 'confirmed').flatMap((order) => order.lines).filter((line) => line.itemId === item.id).reduce((sum, line) => sum + line.quantity, 0);
            return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.sku}</small></td><td>{t(item.type === 'raw_material' ? 'rawMaterial' : item.type === 'blend' ? 'blend' : item.type === 'packaging' ? 'packaging' : 'finishedGood')}</td><td>{formatStock(item.stockOnHand + item.quarantinedStock, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(reserved, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(item.quarantinedStock, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td className={item.stockOnHand - reserved <= item.reorderPoint ? 'department-low' : ''}>{formatStock(item.stockOnHand - reserved, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(item.reorderPoint, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td></tr>;
          })}
        </tbody></table></div>
      </section>
      <section className="surface operations-surface"><SectionHeading eyebrow={t('auditTrail')} title={t('recentMovements')} count={data.movements.length} />
        {movementItems.length === 0 ? <p className="department-empty">{t('noMovements')}</p> : <div className="movement-list">{movementItems.map((movement) => {
          const item = data.items.find((candidate) => candidate.id === movement.itemId);
          return <div className="movement-row" key={movement.id}><span className={`movement-sign ${movement.quantityDelta > 0 ? 'movement-in' : 'movement-out'}`}>{movement.quantityDelta > 0 ? '+' : ''}{formatStock(movement.quantityDelta, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</span><strong>{item?.name ?? t('item')}</strong><span>{t(movement.kind === 'purchase_receipt' ? 'received' : movement.kind === 'shipment' ? 'delivered' : movement.kind === 'production_output' ? 'completed' : movement.kind === 'customer_return' ? 'inspection' : movement.kind === 'return_release' ? 'released' : 'productionUse')}</span><small>{movement.reference} · {dateLabel(movement.createdAt, locale)}</small></div>;
        })}</div>}
      </section>
    </div>
  );
}

type LiveInventoryBalance = {
  item_id: string;
  sku: string;
  name: string;
  item_type: 'raw_material' | 'packaging' | 'blend' | 'finished_good';
  base_unit: 'g' | 'each';
  reorder_point: number | string;
  is_active: boolean;
  location_id: string | null;
  location_name: string | null;
  location_type: string | null;
  on_hand: number | string;
  reserved: number | string;
  quarantined: number | string;
  available: number | string;
};

type LiveInventoryMovement = {
  id: string;
  item_id: string;
  location_id: string;
  movement_type: string;
  quantity_delta: number | string;
  reference_type: string;
  reference_id: string;
  recorded_at: string;
};

function LiveInventoryDepartment({ role }: { role: WorkspaceRole }) {
  const { t, locale } = useLocale();
  const [balances, setBalances] = useState<LiveInventoryBalance[]>([]);
  const [movements, setMovements] = useState<LiveInventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadInventory = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/operations/inventory', { cache: 'no-store' });
      const result = await response.json() as {
        balances?: LiveInventoryBalance[];
        movements?: LiveInventoryMovement[];
        error?: string;
      };
      if (!response.ok || !result.balances || !result.movements) {
        throw new Error(result.error || 'Could not load live inventory balances.');
      }
      setBalances(result.balances);
      setMovements(result.movements);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load live inventory balances.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInventory();
  }, []);

  const itemById = new Map(balances.map((balance) => [balance.item_id, balance]));
  const locationNameById = new Map(balances.filter((balance) => balance.location_id).map((balance) => [balance.location_id!, balance.location_name]));
  const activeItems = new Set(balances.filter((balance) => balance.is_active).map((balance) => balance.item_id));

  return <div className="department-stack">
    {(role === 'manager' || role === 'purchasing') && <LiveInventoryControls onChanged={() => void loadInventory()} />}
    <section className="operations-summary surface">
      <div className="summary-icon summary-icon-gold"><PackageCheck size={18} /></div>
      <div><strong>{loading ? '—' : activeItems.size}</strong><span>{t('activeInventoryItems')}</span></div>
      <div className="summary-divider" />
      <div className="summary-icon summary-icon-green"><ClipboardList size={18} /></div>
      <div><strong>{loading ? '—' : movements.length}</strong><span>{t('recentMovements')}</span></div>
      <div className="delivery-summary-note">{t('liveInventoryNote')}</div>
    </section>
    <section className="surface operations-surface">
      <SectionHeading eyebrow={t('navInventory')} title={t('inventorySubtitle')} count={activeItems.size} />
      {error && <div className="stock-hint" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadInventory()} disabled={loading}>{t('retry')}</Button></div>}
      {loading
        ? <p className="department-empty" role="status">{t('loadingInventory')}</p>
        : error && balances.length === 0
          ? null
        : balances.length === 0
          ? <p className="department-empty">{t('noInventoryItems')}</p>
          : <div className="department-table-wrap"><table className="department-table">
            <thead><tr><th>{t('item')}</th><th>{t('location')}</th><th>{t('type')}</th><th>{t('onHand')}</th><th>{t('reserved')}</th><th>{t('quarantined')}</th><th>{t('available')}</th><th>{t('reorderAt')}</th><th>{t('status')}</th></tr></thead>
            <tbody>{balances.map((balance) => {
              const available = Number(balance.available);
              const unit = balance.base_unit;
              return <tr key={`${balance.item_id}-${balance.location_id ?? 'unlocated'}`}>
                <td><strong>{balance.name}</strong><small>{balance.sku}</small></td>
                <td>{balance.location_name ?? t('noLocation')}</td>
                <td>{t(balance.item_type === 'raw_material' ? 'rawMaterial' : balance.item_type === 'blend' ? 'blend' : balance.item_type === 'packaging' ? 'packaging' : 'finishedGood')}</td>
                <td>{formatStock(Number(balance.on_hand), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td>
                <td>{formatStock(Number(balance.reserved), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td>
                <td>{formatStock(Number(balance.quarantined), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td>
                <td className={available <= Number(balance.reorder_point) ? 'department-low' : ''}>{formatStock(available, unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td>
                <td>{formatStock(Number(balance.reorder_point), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td>
                <td><span className={`status ${balance.is_active ? 'status-ready' : 'status-empty'}`}>{t(balance.is_active ? 'supplierActive' : 'supplierInactive')}</span></td>
              </tr>;
            })}</tbody>
          </table></div>}
    </section>
    <section className="surface operations-surface">
      <SectionHeading eyebrow={t('auditTrail')} title={t('recentMovements')} count={movements.length} />
      {loading
        ? <p className="department-empty" role="status">{t('loadingMovements')}</p>
        : error && movements.length === 0
          ? null
        : movements.length === 0
          ? <p className="department-empty">{t('noMovements')}</p>
          : <div className="movement-list">{movements.map((movement) => {
            const item = itemById.get(movement.item_id);
            return <div className="movement-row" key={movement.id}>
              <span className={`movement-sign ${Number(movement.quantity_delta) > 0 ? 'movement-in' : 'movement-out'}`}>{Number(movement.quantity_delta) > 0 ? '+' : ''}{formatStock(Number(movement.quantity_delta), item?.base_unit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</span>
              <strong>{item?.name ?? t('item')} <small>{item?.sku}</small></strong>
              <span>{t(movementTypeKey(movement.movement_type))}</span>
              <small>{locationNameById.get(movement.location_id) ?? t('noLocation')} · {movement.reference_type} · {dateLabel(movement.recorded_at, locale)}</small>
            </div>;
          })}</div>}
    </section>
  </div>;
}

function movementTypeKey(type: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    opening_balance: 'openingBalance',
    purchase_receipt: 'received',
    production_output: 'completed',
    production_consumption: 'productionUse',
    shipment: 'delivered',
    customer_return: 'inspection',
    supplier_return: 'supplierReturn',
    adjustment: 'stockAdjustment',
    transfer_in: 'stockTransferIn',
    transfer_out: 'stockTransferOut',
  };
  return keys[type] ?? 'auditTrail';
}

function InventoryDepartment({ data, isAuthenticated, role }: { data: WorkspaceData; isAuthenticated: boolean; role: WorkspaceRole }) {
  return isAuthenticated ? <LiveInventoryDepartment role={role} /> : <PreviewInventoryDepartment data={data} />;
}

function PreviewSupplierForm({ suppliers, onSave }: { suppliers: Supplier[]; onSave: (supplier: Supplier) => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ id: `supplier-${crypto.randomUUID()}`, name: name.trim(), contactName: contactName.trim(), phone: phone.trim(), leadTimeDays: 7, active: true });
    setName(''); setPhone(''); setContactName(''); setOpen(false);
  };
  return <div className="supplier-manager"><div className="department-inline-heading"><div><strong>{t('suppliers')}</strong><small>{suppliers.length} {t('activeSuppliers')}</small></div><Button className="small-action" onClick={() => setOpen(!open)}><Plus size={14} />{t('addSupplier')}</Button></div>
    {open && <form className="quick-form quick-form-inline" onSubmit={submit}><Input aria-label={t('supplierName')} placeholder={t('supplierName')} value={name} onChange={(event) => setName(event.target.value)} required /><Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} /><Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} /><Button className="button button-primary" type="submit">{t('saveChanges')}</Button></form>}
  </div>;
}

type LiveSupplier = {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
  lead_time_days: number;
  is_active: boolean;
};

function LiveSupplierDirectory({ canManage }: { canManage: boolean }) {
  const { t } = useLocale();
  const [suppliers, setSuppliers] = useState<LiveSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('7');

  const loadSuppliers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/operations/suppliers', { cache: 'no-store' });
      const result = await response.json() as { suppliers?: LiveSupplier[]; error?: string };
      if (!response.ok || !result.suppliers) throw new Error(result.error || 'Could not load supplier records.');
      setSuppliers(result.suppliers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load supplier records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setContactName('');
    setPhone('');
    setLeadTimeDays('7');
    setOpen(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/operations/suppliers', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { id: editingId, isActive: suppliers.find((supplier) => supplier.id === editingId)?.is_active ?? true } : {}),
          name,
          contactName,
          phone,
          leadTimeDays: Number(leadTimeDays),
        }),
      });
      const result = await response.json() as { supplier?: LiveSupplier; error?: string };
      if (!response.ok || !result.supplier) throw new Error(result.error || 'Could not save this supplier record.');
      const savedSupplier = result.supplier;
      setSuppliers((current) => editingId
        ? current.map((supplier) => supplier.id === savedSupplier.id ? savedSupplier : supplier)
        : [...current, savedSupplier].sort((a, b) => a.name.localeCompare(b.name)));
      setNotice(editingId ? t('supplierUpdated') : t('supplierCreated'));
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this supplier record.');
    } finally {
      setSaving(false);
    }
  };

  const editSupplier = (supplier: LiveSupplier) => {
    setEditingId(supplier.id);
    setName(supplier.name);
    setContactName(supplier.contact_name);
    setPhone(supplier.phone);
    setLeadTimeDays(String(supplier.lead_time_days));
    setOpen(true);
    setError('');
    setNotice('');
  };

  const toggleActive = async (supplier: LiveSupplier) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/operations/suppliers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: supplier.id,
          isActive: !supplier.is_active,
          name: supplier.name,
          contactName: supplier.contact_name,
          phone: supplier.phone,
          leadTimeDays: supplier.lead_time_days,
        }),
      });
      const result = await response.json() as { supplier?: LiveSupplier; error?: string };
      if (!response.ok || !result.supplier) throw new Error(result.error || 'Could not update this supplier record.');
      const updatedSupplier = result.supplier;
      setSuppliers((current) => current.map((record) => record.id === supplier.id ? updatedSupplier : record));
      setNotice(t(supplier.is_active ? 'supplierDeactivated' : 'supplierReactivated'));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update this supplier record.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="surface operations-surface">
    <div className="section-heading">
      <div><p className="section-kicker">{t('suppliers')}</p><h2>{t('supplierDirectorySubtitle')}</h2></div>
      {canManage && <Button className="button button-primary" onClick={() => { resetForm(); setOpen(true); }}><Plus size={16} />{t('addSupplier')}</Button>}
    </div>
    <p className="stock-hint"><PackageCheck size={15} />{t('supplierDirectoryLiveNote')}</p>
    {open && canManage && <form className="quick-form" onSubmit={submit}>
      <Input aria-label={t('supplierName')} placeholder={t('supplierName')} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
      <Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} />
      <Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
      <Input aria-label={t('leadTimeDays')} placeholder={t('leadTimeDays')} type="number" min="0" max="3650" step="1" value={leadTimeDays} onChange={(event) => setLeadTimeDays(event.target.value)} required />
      <Button className="button button-primary" type="submit" disabled={saving}>{saving ? t('saving') : t('saveChanges')}</Button>
      <Button variant="outline" type="button" onClick={resetForm} disabled={saving}>{t('cancel')}</Button>
    </form>}
    {error && <div className="stock-hint" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadSuppliers()} disabled={loading}>{t('retry')}</Button></div>}
    {notice && <p className="stock-hint" role="status"><Check size={15} />{notice}</p>}
    {loading
      ? <p className="department-empty" role="status">{t('loadingSuppliers')}</p>
      : suppliers.length === 0
        ? <p className="department-empty">{t('noSuppliers')}</p>
        : <div className="department-table-wrap"><table className="department-table">
          <thead><tr><th>{t('supplierName')}</th><th>{t('contact')}</th><th>{t('phone')}</th><th>{t('leadTimeDays')}</th><th>{t('status')}</th>{canManage && <th>{t('actions')}</th>}</tr></thead>
          <tbody>{suppliers.map((supplier) => <tr key={supplier.id}>
            <td><strong>{supplier.name}</strong><small>{supplier.code}</small></td>
            <td>{supplier.contact_name || '—'}</td>
            <td dir="ltr">{supplier.phone || '—'}</td>
            <td>{supplier.lead_time_days} {t('days')}</td>
            <td><span className={`status ${supplier.is_active ? 'status-ready' : 'status-empty'}`}>{t(supplier.is_active ? 'supplierActive' : 'supplierInactive')}</span></td>
            {canManage && <td className="table-actions">
              <Button variant="outline" size="sm" onClick={() => editSupplier(supplier)} disabled={saving} aria-label={`${t('editSupplier')}: ${supplier.name}`}><Pencil size={15} />{t('editSupplier')}</Button>
              <Button variant="outline" size="sm" onClick={() => void toggleActive(supplier)} disabled={saving} aria-label={`${t(supplier.is_active ? 'supplierDeactivate' : 'supplierReactivate')}: ${supplier.name}`}>
                {supplier.is_active ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}{t(supplier.is_active ? 'supplierDeactivate' : 'supplierReactivate')}
              </Button>
            </td>}
          </tr>)}</tbody>
        </table></div>}
  </section>;
}

function PurchasingDepartment({ data, onCreatePurchase, onPurchaseOrdered, onReceivePurchase, onAddSupplier, isAuthenticated, role }: {
  data: WorkspaceData;
  onCreatePurchase: (supplierId: string, lines: PurchaseOrderLine[]) => void;
  onPurchaseOrdered: (purchaseId: string) => void;
  onReceivePurchase: (purchaseId: string) => void;
  onAddSupplier: (supplier: Supplier) => void;
  isAuthenticated: boolean;
  role: WorkspaceRole;
}) {
  const { t, locale } = useLocale();
  const needs = calculatePurchaseNeeds(data);
  const productionNeeds = calculateProductionRequirements(data);
  const [supplierId, setSupplierId] = useState(data.suppliers.find((supplier) => supplier.active)?.id ?? '');
  const estimatedSpend = needs.reduce((sum, need) => {
    const supplier = data.suppliers.find((candidate) => candidate.id === supplierId);
    const cost = supplier?.name.includes('Pack') ? 0.4 : 0.08;
    return sum + need.quantity * cost;
  }, 0);

  if (isAuthenticated) {
    return role === 'delivery'
      ? <p className="department-empty" role="alert">{t('purchasingAccessRequired')}</p>
      : <div className="department-stack"><LivePurchasingOperations /><LiveSupplierDirectory canManage /></div>;
  }

  const createDraft = () => {
    if (!supplierId || needs.length === 0) return;
    onCreatePurchase(supplierId, needs.map((need) => ({ itemId: need.item.id, quantity: need.quantity, receivedQuantity: 0, unitCostMad: need.item.baseUnit === 'g' ? 0.08 : 0.4 })));
  };

  return <div className="department-stack">
    <section className="operations-summary surface"><div className="summary-icon summary-icon-gold"><CircleAlert size={18} /></div><div><strong>{needs.length}</strong><span>{t('itemsToBuy')}</span></div><div className="summary-divider" /><div className="summary-icon summary-icon-green"><ClipboardList size={18} /></div><div><strong>{productionNeeds.length}</strong><span>{t('materialNeeds')}</span></div><div className="delivery-summary-note">{t('purchaseHint')}</div></section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('needsAttention')} title={t('stockToBuy')} count={needs.length} />
      {needs.length === 0 ? <p className="department-empty">{t('noNeedToBuy')}</p> : <><div className="department-table-wrap"><table className="department-table"><thead><tr><th>{t('item')}</th><th>{t('available')}</th><th>{t('reorderAt')}</th><th>{t('openPurchaseQty')}</th><th>{t('suggestedQty')}</th><th>{t('reason')}</th></tr></thead><tbody>{needs.map((need) => <tr key={need.item.id}><td><strong>{need.item.name}</strong><small>{need.item.sku}</small></td><td className={need.item.stockOnHand <= need.item.reorderPoint ? 'department-low' : ''}>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(need.item.reorderPoint, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(data.purchaseOrders.flatMap((po) => po.lines).filter((line) => line.itemId === need.item.id).reduce((sum, line) => sum + Math.max(0, line.quantity - line.receivedQuantity), 0), need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td><strong>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></td><td>{need.reasons.map((reason) => t(reason === 'production' ? 'productionReason' : 'reorder')).join(' + ')}</td></tr>)}</tbody></table></div>
        <div className="purchase-draft-controls"><label className="field"><span>{t('supplier')}</span><Select value={supplierId || 'unselected'} onValueChange={(value) => setSupplierId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('supplier')} /></SelectTrigger><SelectContent>{data.suppliers.filter((supplier) => supplier.active).map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.leadTimeDays} {t('days')}</SelectItem>)}</SelectContent></Select></label><div className="purchase-estimate"><small>{t('estimatedSpend')}</small><strong>{formatMad(estimatedSpend, locale)}</strong></div><Button variant="primary" className="button button-primary" onClick={createDraft} disabled={!supplierId}><Plus size={16} />{t('createPurchaseDraft')}</Button></div>
      </>}
    </section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('supplierOrders')} title={t('purchaseOrders')} count={data.purchaseOrders.length} />
      {data.purchaseOrders.length === 0 ? <p className="department-empty">{t('noPurchaseOrders')}</p> : <div className="department-record-list">{data.purchaseOrders.map((purchase) => <article className="department-record" key={purchase.id}><div><div className="operation-record-title"><strong>{purchase.number}</strong><span className={`status ${purchase.status === 'received' ? 'status-ready' : purchase.status === 'draft' ? 'status-neutral' : 'status-warning'}`}>{t(purchase.status === 'part_received' ? 'partReceived' : purchase.status)}</span></div><h3>{purchase.supplierName}</h3><small>{dateLabel(purchase.createdAt, locale)} · {purchase.lines.length} {t('lines')}</small></div><div className="department-record-lines">{purchase.lines.map((line) => { const item = data.items.find((entry) => entry.id === line.itemId); return <div className="operation-line" key={line.itemId}><span>{item?.name}<small>{formatStock(line.receivedQuantity, item?.baseUnit ?? 'g', locale === 'ar' ? 'ar-MA' : 'en-MA')} / {formatStock(line.quantity, item?.baseUnit ?? 'g', locale === 'ar' ? 'ar-MA' : 'en-MA')}</small></span><strong>{formatMad(line.quantity * line.unitCostMad, locale)}</strong></div>; })}</div><div className="operation-record-action">{purchase.status === 'draft' ? <Button className="button button-secondary" onClick={() => onPurchaseOrdered(purchase.id)}>{t('sendPurchase')}</Button> : purchase.status !== 'received' ? <Button className="button button-secondary" onClick={() => onReceivePurchase(purchase.id)}><PackageCheck size={15} />{t('markReceived')}</Button> : <span className="done-indicator"><Check size={15} />{t('received')}</span>}</div></article>)}</div>}
    </section>
    <section className="surface operations-surface"><PreviewSupplierForm suppliers={data.suppliers} onSave={onAddSupplier} /></section>
  </div>;
}

function ProductionDepartment({ data, onCreateProduction, onStartProduction, onCompleteProduction }: {
  data: WorkspaceData;
  onCreateProduction: (itemId: string, quantity: number) => void;
  onStartProduction: (productionId: string) => void;
  onCompleteProduction: (productionId: string) => void;
}) {
  const { t, locale } = useLocale();
  const needs = calculateFinishedProductionNeeds(data);
  const materials = calculateProductionRequirements(data);
  return <div className="department-stack">
    <section className="operations-summary surface"><div className="summary-icon summary-icon-gold"><ClipboardList size={18} /></div><div><strong>{needs.length}</strong><span>{t('finishedGoodsToMake')}</span></div><div className="summary-divider" /><div className="summary-icon summary-icon-green"><PackageCheck size={18} /></div><div><strong>{materials.length}</strong><span>{t('materialLines')}</span></div><div className="delivery-summary-note">{t('productionHint')}</div></section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('needsAttention')} title={t('workersNeed')} count={needs.length} />
      {needs.length === 0 ? <p className="department-empty">{t('noProductionNeed')}</p> : <div className="department-record-list">{needs.map((need) => <article className="department-record" key={need.item.id}><div><strong>{need.item.name}</strong><small>{need.item.sku} · {t('reorderAt')} {formatStock(need.item.reorderPoint, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</small></div><div className="production-target"><span>{t('available')}</span><strong>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><div className="production-target"><span>{t('quantity')}</span><strong>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><Button className="button button-primary" onClick={() => onCreateProduction(need.item.id, need.quantity)}>{t('createWorkOrder')}</Button></article>)}</div>}
    </section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('materials')} title={t('requestedMaterials')} count={materials.length} />
      {materials.length === 0 ? <p className="department-empty">{t('noProductionNeed')}</p> : <div className="department-table-wrap"><table className="department-table"><thead><tr><th>{t('item')}</th><th>{t('available')}</th><th>{t('quantity')}</th><th>{t('materialShortage')}</th><th>{t('reason')}</th></tr></thead><tbody>{materials.map((need) => { const shortage = Math.max(0, need.quantity - need.item.stockOnHand); return <tr key={need.item.id}><td><strong>{need.item.name}</strong><small>{need.item.sku}</small></td><td>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td className={shortage > 0 ? 'department-low' : ''}>{formatStock(shortage, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{need.reasons.join(', ')}</td></tr>; })}</tbody></table></div>}
    </section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('production')} title={t('productionQueue')} count={data.productionOrders.length} />
      {data.productionOrders.length === 0 ? <p className="department-empty">{t('noProduction')}</p> : <div className="department-record-list">{data.productionOrders.map((order) => { const item = data.items.find((entry) => entry.id === order.itemId); return <article className="department-record" key={order.id}><div><div className="operation-record-title"><strong>{order.number}</strong><span className={`status ${order.status === 'completed' ? 'status-ready' : 'status-warning'}`}>{t(order.status === 'in_progress' ? 'inProgress' : order.status)}</span></div><h3>{item?.name}</h3></div><div className="production-target"><span>{t('planned')}</span><strong>{formatStock(order.targetQuantity, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><div className="operation-record-action">{order.status === 'planned' ? <Button className="button button-secondary" onClick={() => onStartProduction(order.id)}>{t('startProduction')}</Button> : order.status === 'in_progress' ? <Button className="button button-primary" onClick={() => onCompleteProduction(order.id)}>{t('completeProduction')}</Button> : <span className="done-indicator"><Check size={15} />{t('completed')}</span>}</div></article>; })}</div>}
    </section>
  </div>;
}

function PreviewClientsDepartment({ data, onSaveClient }: { data: WorkspaceData; onSaveClient: (client: ClientAccount) => void }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSaveClient({ id: `client-${crypto.randomUUID()}`, name: name.trim(), contactName: contactName.trim(), phone: phone.trim(), city: city.trim(), address: address.trim(), active: true });
    setName(''); setContactName(''); setPhone(''); setCity(''); setAddress(''); setOpen(false);
  };
  return <section className="surface operations-surface"><div className="section-heading"><div><p className="section-kicker">{t('navClients')}</p><h2>{t('clientsSubtitle')}</h2></div><Button className="button button-primary" onClick={() => setOpen(!open)}><Plus size={16} />{t('addClient')}</Button></div>
    {open && <form className="quick-form" onSubmit={submit}><Input placeholder={t('customerOrStore')} value={name} onChange={(event) => setName(event.target.value)} required /><Input placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} /><Input placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} /><Input placeholder={t('city')} value={city} onChange={(event) => setCity(event.target.value)} /><Input placeholder={t('address')} value={address} onChange={(event) => setAddress(event.target.value)} /><Button className="button button-primary" type="submit">{t('saveChanges')}</Button></form>}
    <div className="department-table-wrap"><table className="department-table"><thead><tr><th>{t('customerOrStore')}</th><th>{t('contact')}</th><th>{t('phone')}</th><th>{t('city')}</th><th>{t('openOrders')}</th><th>{t('outstandingInvoices')}</th></tr></thead><tbody>{data.clients.filter((client) => client.active).map((client) => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.address}</small></td><td>{client.contactName || '—'}</td><td dir="ltr">{client.phone || '—'}</td><td>{client.city || '—'}</td><td>{data.orders.filter((order) => order.clientId === client.id && order.status === 'confirmed').length}</td><td>{formatMad(data.invoices.filter((invoice) => invoice.clientId === client.id).reduce((sum, invoice) => sum + invoice.amountMad - invoice.paidMad, 0), locale)}</td></tr>)}</tbody></table></div>
    {data.clients.length === 0 && <p className="department-empty">{t('noClients')}</p>}
  </section>;
}

type LiveClient = {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
  address: string;
  city: string;
  latitude: number | string | null;
  longitude: number | string | null;
  is_active: boolean;
};

function coordinateValue(value: LiveClient['latitude']) {
  return value === null ? '' : String(value);
}

function LiveClientsDepartment({ canManage }: { canManage: boolean }) {
  const { t } = useLocale();
  const [clients, setClients] = useState<LiveClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [showMap, setShowMap] = useState(false);

  const loadClients = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/operations/clients', { cache: 'no-store' });
      const result = await response.json() as { clients?: LiveClient[]; error?: string };
      if (!response.ok || !result.clients) throw new Error(result.error || 'Could not load client records.');
      setClients(result.clients);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load client records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClients();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setContactName('');
    setPhone('');
    setCity('');
    setAddress('');
    setLatitude('');
    setLongitude('');
    setOpen(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/operations/clients', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { id: editingId, isActive: clients.find((client) => client.id === editingId)?.is_active ?? true } : {}),
          name,
          contactName,
          phone,
          city,
          address,
          latitude: latitude.trim() === '' ? null : Number(latitude),
          longitude: longitude.trim() === '' ? null : Number(longitude),
        }),
      });
      const result = await response.json() as { client?: LiveClient; error?: string };
      if (!response.ok || !result.client) throw new Error(result.error || 'Could not save this client record.');
      const savedClient = result.client;
      setClients((current) => editingId
        ? current.map((client) => client.id === savedClient.id ? savedClient : client)
        : [...current, savedClient].sort((a, b) => a.name.localeCompare(b.name)));
      setNotice(editingId ? t('clientUpdated') : t('clientCreated'));
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this client record.');
    } finally {
      setSaving(false);
    }
  };

  const editClient = (client: LiveClient) => {
    setEditingId(client.id);
    setName(client.name);
    setContactName(client.contact_name);
    setPhone(client.phone);
    setCity(client.city);
    setAddress(client.address);
    setLatitude(coordinateValue(client.latitude));
    setLongitude(coordinateValue(client.longitude));
    setOpen(true);
    setError('');
    setNotice('');
  };

  const toggleActive = async (client: LiveClient) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/operations/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          isActive: !client.is_active,
          name: client.name,
          contactName: client.contact_name,
          phone: client.phone,
          city: client.city,
          address: client.address,
        }),
      });
      const result = await response.json() as { client?: LiveClient; error?: string };
      if (!response.ok || !result.client) throw new Error(result.error || 'Could not update this client record.');
      const updatedClient = result.client;
      setClients((current) => current.map((record) => record.id === client.id ? updatedClient : record));
      setNotice(t(client.is_active ? 'clientDeactivated' : 'clientReactivated'));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update this client record.');
    } finally {
      setSaving(false);
    }
  };

  const mapLocations = useMemo<ClientMapLocation[]>(() => clients
    .filter((client) => client.is_active && client.latitude !== null && client.longitude !== null)
    .flatMap((client) => {
      const latitudeValue = Number(client.latitude);
      const longitudeValue = Number(client.longitude);
      return Number.isFinite(latitudeValue) && Number.isFinite(longitudeValue)
        ? [{
          name: client.name,
          city: client.city,
          address: client.address,
          latitude: latitudeValue,
          longitude: longitudeValue,
        }]
        : [];
    }), [clients]);
  const activeClientCount = clients.filter((client) => client.is_active).length;

  return <section className="surface operations-surface">
    <div className="section-heading">
      <div><p className="section-kicker">{t('navClients')}</p><h2>{t('clientsSubtitle')}</h2></div>
      <div className="client-heading-actions">
        <div className="client-view-switch" role="group" aria-label={t('clientViews')}>
          <Button variant={showMap ? 'outline' : 'default'} size="sm" onClick={() => setShowMap(false)} aria-pressed={!showMap}>
            <List size={15} />{t('clientListView')}
          </Button>
          <Button variant={showMap ? 'default' : 'outline'} size="sm" onClick={() => setShowMap(true)} aria-pressed={showMap}>
            <MapPinned size={15} />{t('clientMapView')}
          </Button>
        </div>
        {canManage && <Button className="button button-primary" onClick={() => { resetForm(); setOpen(true); }}><Plus size={16} />{t('addClient')}</Button>}
      </div>
    </div>
    {open && canManage && <form className="quick-form client-edit-form" onSubmit={submit}>
      <Input aria-label={t('customerOrStore')} placeholder={t('customerOrStore')} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
      <Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} />
      <Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
      <Input aria-label={t('city')} placeholder={t('city')} value={city} onChange={(event) => setCity(event.target.value)} maxLength={120} />
      <Input aria-label={t('address')} placeholder={t('address')} value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} />
      <label className="client-coordinate-field">
        <span>{t('latitude')}</span>
        <Input aria-label={t('latitude')} type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
      </label>
      <label className="client-coordinate-field">
        <span>{t('longitude')}</span>
        <Input aria-label={t('longitude')} type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
      </label>
      <p className="client-coordinate-note">{t('clientCoordinateHelp')}</p>
      <Button className="button button-primary" type="submit" disabled={saving}>{saving ? t('saving') : t('saveChanges')}</Button>
      <Button variant="outline" type="button" onClick={resetForm} disabled={saving}>{t('cancel')}</Button>
    </form>}
    {error && <div className="stock-hint" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadClients()} disabled={loading}>{t('retry')}</Button></div>}
    {notice && <p className="stock-hint" role="status"><Check size={15} />{notice}</p>}
    {showMap && <>
      <div className="client-map-summary" role="status">
        <span><strong>{mapLocations.length}</strong> {t('mappedClientStores')}</span>
        <span><strong>{activeClientCount - mapLocations.length}</strong> {t('clientStoresWithoutCoordinates')}</span>
      </div>
      <ClientLocationMap clients={mapLocations} />
    </>}
    {loading
      ? <p className="department-empty" role="status">{t('loadingClients')}</p>
      : clients.length === 0
        ? <p className="department-empty">{t('noClients')}</p>
        : <div className="department-table-wrap"><table className="department-table">
          <thead><tr><th>{t('customerOrStore')}</th><th>{t('contact')}</th><th>{t('phone')}</th><th>{t('city')}</th>{canManage && <th>{t('actions')}</th>}</tr></thead>
          <tbody>{clients.map((client) => <tr key={client.id}>
            <td><strong>{client.name}</strong><small>{client.address || client.code}</small></td>
            <td>{client.contact_name || '—'}</td>
            <td dir="ltr">{client.phone || '—'}</td>
            <td>{client.city || '—'}</td>
            {canManage && <td className="table-actions">
              <Button variant="outline" size="sm" onClick={() => editClient(client)} disabled={saving} aria-label={`${t('editClient')}: ${client.name}`}><Pencil size={15} />{t('editClient')}</Button>
              <Button variant="outline" size="sm" onClick={() => void toggleActive(client)} disabled={saving} aria-label={`${t(client.is_active ? 'clientDeactivate' : 'clientReactivate')}: ${client.name}`}>
                {client.is_active ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}{t(client.is_active ? 'clientDeactivate' : 'clientReactivate')}
              </Button>
            </td>}
          </tr>)}</tbody>
        </table></div>}
  </section>;
}

function ClientsDepartment({ data, onSaveClient, role, isAuthenticated }: {
  data: WorkspaceData;
  onSaveClient: (client: ClientAccount) => void;
  role: WorkspaceRole;
  isAuthenticated: boolean;
}) {
  return isAuthenticated
    ? <LiveClientsDepartment canManage={role === 'manager'} />
    : <PreviewClientsDepartment data={data} onSaveClient={onSaveClient} />;
}

function InvoiceDepartment({ data, onCreateInvoice, onRecordPayment }: { data: WorkspaceData; onCreateInvoice: (deliveryId: string) => void; onRecordPayment: (invoiceId: string, amount: number) => void }) {
  const { t, locale } = useLocale();
  const uninvoiced = data.deliveryNotes.filter((note) => !data.invoices.some((invoice) => invoice.deliveryNoteId === note.id));
  return <div className="department-stack"><section className="surface operations-surface"><SectionHeading eyebrow={t('invoiceNumber')} title={t('createInvoice')} count={uninvoiced.length} />
    {uninvoiced.length > 0 && <div className="unbilled-list">{uninvoiced.map((note) => <div className="unbilled-row" key={note.id}><div><strong>{note.customer}</strong><small>{note.number} · {dateLabel(note.createdAt, locale)}</small></div><strong>{formatMad(note.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMad, 0), locale)}</strong><Button className="button button-secondary" onClick={() => onCreateInvoice(note.id)}><ReceiptText size={15} />{t('createInvoice')}</Button></div>)}</div>}
    {uninvoiced.length === 0 && <p className="department-empty">{t('noUnbilledDeliveries')}</p>}
  </section><section className="surface operations-surface"><SectionHeading eyebrow={t('navInvoices')} title={t('outstandingInvoices')} count={data.invoices.length} /><p className="preview-footnote">{t('notLegalInvoice')}</p>
    {data.invoices.length === 0 ? <p className="department-empty">{t('noInvoices')}</p> : <div className="department-record-list">{data.invoices.map((invoice) => { const due = Math.max(0, invoice.amountMad - invoice.paidMad); return <article className="department-record" key={invoice.id}><div><div className="operation-record-title"><strong>{invoice.number}</strong><span className={`status ${due === 0 ? 'status-ready' : 'status-warning'}`}>{t(due === 0 ? 'paidInFull' : invoice.paidMad > 0 ? 'partiallyPaid' : 'unpaid')}</span></div><h3>{invoice.customer}</h3><small>{invoice.deliveryNumber} · {dateLabel(invoice.issuedAt, locale)}</small></div><div className="invoice-amount"><span>{t('total')}</span><strong>{formatMad(invoice.amountMad, locale)}</strong></div><div className="invoice-amount"><span>{t('balanceDue')}</span><strong>{formatMad(due, locale)}</strong></div>{due > 0 && <Button className="button button-secondary" onClick={() => onRecordPayment(invoice.id, due)}>{t('recordPayment')}</Button>}</article>; })}</div>}
  </section></div>;
}

function ReturnsDepartment({ data, onCreateReturn, onReceiveReturn, onResolveReturn }: { data: WorkspaceData; onCreateReturn: (deliveryId: string, reason: string, itemId: string, quantity: number) => void; onReceiveReturn: (returnId: string) => void; onResolveReturn: (returnId: string, decision: 'release' | 'reject') => void }) {
  const { t } = useLocale();
  const [deliveryId, setDeliveryId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const deliveredNotes = data.deliveryNotes;
  const selectedDelivery = deliveredNotes.find((note) => note.id === deliveryId);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(quantity);
    if (!deliveryId || !itemId || !reason.trim() || !Number.isInteger(parsed) || parsed <= 0) return;
    onCreateReturn(deliveryId, reason.trim(), itemId, parsed);
    setDeliveryId(''); setItemId(''); setQuantity('1'); setReason('');
  };
  return <div className="department-stack"><section className="surface operations-surface"><SectionHeading eyebrow={t('navReturns')} title={t('requestReturn')} count={data.returns.length} /><p className="stock-hint"><RotateCcw size={15} />{t('pendingInspection')}</p>
    <form className="quick-form return-form" onSubmit={submit}><Select value={deliveryId || 'unselected'} onValueChange={(value) => { setDeliveryId(value === 'unselected' ? '' : value); setItemId(''); }}><SelectTrigger aria-label={t('selectDelivery')}><SelectValue placeholder={t('selectDelivery')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectDelivery')}</SelectItem>{deliveredNotes.map((note) => <SelectItem key={note.id} value={note.id}>{note.number} · {note.customer}</SelectItem>)}</SelectContent></Select><Select value={itemId || 'unselected'} onValueChange={(value) => setItemId(value === 'unselected' ? '' : value)} disabled={!selectedDelivery}><SelectTrigger aria-label={t('item')}><SelectValue placeholder={t('item')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('item')}</SelectItem>{selectedDelivery?.lines.map((line) => <SelectItem key={line.itemId} value={line.itemId}>{line.name}</SelectItem>)}</SelectContent></Select><Input type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label={t('quantity')} required /><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('returnReason')} required /><Button variant="primary" className="button button-primary" type="submit">{t('requestReturn')}</Button></form>
  </section><section className="surface operations-surface"><SectionHeading eyebrow={t('inspection')} title={t('navReturns')} count={data.returns.length} />
    {data.returns.length === 0 ? <p className="department-empty">{t('noReturns')}</p> : <div className="department-record-list">{data.returns.map((record) => <ReturnRecord key={record.id} record={record} data={data} onReceive={onReceiveReturn} onResolve={onResolveReturn} />)}</div>}
  </section></div>;
}

function ReturnRecord({ record, data, onReceive, onResolve }: { record: CustomerReturn; data: WorkspaceData; onReceive: (id: string) => void; onResolve: (id: string, decision: 'release' | 'reject') => void }) {
  const { t, locale } = useLocale();
  return <article className="department-record"><div><div className="operation-record-title"><strong>{record.number}</strong><span className={`status ${record.status === 'released' ? 'status-ready' : record.status === 'rejected' ? 'status-empty' : 'status-warning'}`}>{t(record.status)}</span></div><h3>{record.customer}</h3><small>{record.deliveryNumber} · {record.reason}</small></div><div className="department-record-lines">{record.lines.map((line) => { const item = data.items.find((candidate) => candidate.id === line.itemId); return <div className="operation-line" key={line.itemId}><span>{item?.name}</span><strong>{formatStock(line.quantity, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div>; })}</div><div className="operation-record-action">{record.status === 'requested' ? <Button className="button button-secondary" onClick={() => onReceive(record.id)}>{t('inspectReturn')}</Button> : record.status === 'inspection' ? <div className="return-actions"><Button className="button button-secondary" onClick={() => onResolve(record.id, 'release')}>{t('releaseReturn')}</Button><Button className="button button-secondary" onClick={() => onResolve(record.id, 'reject')}>{t('rejectReturn')}</Button></div> : <span className="done-indicator"><Check size={14} />{t(record.status)}</span>}</div></article>;
}

function AccessDepartment({ roleAccess, onChange }: { roleAccess: RoleAccess; onChange: (access: RoleAccess) => void }) {
  const { t } = useLocale();
  const toggle = (role: WorkspaceRole, page: WorkspacePage) => {
    const current = roleAccess[role];
    const pages = current.includes(page) ? current.filter((entry) => entry !== page) : [...current, page];
    if (!pages.includes('overview')) pages.unshift('overview');
    onChange({ ...roleAccess, [role]: pages });
  };
  const roles: WorkspaceRole[] = ['manager', 'purchasing', 'delivery'];
  return <section className="surface operations-surface"><SectionHeading eyebrow={t('navAccess')} title={t('accessSubtitle')} /><div className="access-warning"><CircleAlert size={16} /><p>{t('accessNote')}</p></div><div className="access-grid"><div className="access-row access-head"><span>{t('navigation')}</span>{roles.map((role) => <strong key={role}>{t(ROLE_LABEL_KEYS[role])}</strong>)}</div>{WORKSPACE_PAGES.map((page) => <div className="access-row" key={page}><span>{t(PAGE_LABEL_KEYS[page])}</span>{roles.map((role) => <label className="access-toggle" key={`${page}-${role}`}><Checkbox checked={roleAccess[role].includes(page)} disabled={page === 'overview'} onCheckedChange={() => toggle(role, page)} aria-label={`${t(ROLE_LABEL_KEYS[role])}: ${t(PAGE_LABEL_KEYS[page])}`} /><span /></label>)}</div>)}</div><p className="preview-footnote">{t('accessPreviewOnly')}</p></section>;
}

export function DepartmentWorkspace({
  page,
  role,
  isAuthenticated,
  data,
  roleAccess,
  onCreatePurchase,
  onPurchaseOrdered,
  onReceivePurchase,
  onAddSupplier,
  onCreateProduction,
  onStartProduction,
  onCompleteProduction,
  onSaveClient,
  onCreateInvoice,
  onRecordPayment,
  onCreateReturn,
  onReceiveReturn,
  onResolveReturn,
  onRoleAccessChange,
}: {
  page: WorkspacePage;
  role: WorkspaceRole;
  isAuthenticated: boolean;
  data: WorkspaceData;
  roleAccess: RoleAccess;
  onCreatePurchase: (supplierId: string, lines: PurchaseOrderLine[]) => void;
  onPurchaseOrdered: (purchaseId: string) => void;
  onReceivePurchase: (purchaseId: string) => void;
  onAddSupplier: (supplier: Supplier) => void;
  onCreateProduction: (itemId: string, quantity: number) => void;
  onStartProduction: (productionId: string) => void;
  onCompleteProduction: (productionId: string) => void;
  onSaveClient: (client: ClientAccount) => void;
  onCreateInvoice: (deliveryId: string) => void;
  onRecordPayment: (invoiceId: string, amount: number) => void;
  onCreateReturn: (deliveryId: string, reason: string, itemId: string, quantity: number) => void;
  onReceiveReturn: (returnId: string) => void;
  onResolveReturn: (returnId: string, decision: 'release' | 'reject') => void;
  onRoleAccessChange: (access: RoleAccess) => void;
}) {
  if (page === 'inventory') return <InventoryDepartment data={data} isAuthenticated={isAuthenticated} role={role} />;
  if (page === 'purchasing') return <PurchasingDepartment data={data} onCreatePurchase={onCreatePurchase} onPurchaseOrdered={onPurchaseOrdered} onReceivePurchase={onReceivePurchase} onAddSupplier={onAddSupplier} isAuthenticated={isAuthenticated} role={role} />;
  if (page === 'production') return <ProductionDepartment data={data} onCreateProduction={onCreateProduction} onStartProduction={onStartProduction} onCompleteProduction={onCompleteProduction} />;
  if (page === 'clients') return <ClientsDepartment data={data} onSaveClient={onSaveClient} role={role} isAuthenticated={isAuthenticated} />;
  if (page === 'invoices') return <InvoiceDepartment data={data} onCreateInvoice={onCreateInvoice} onRecordPayment={onRecordPayment} />;
  if (page === 'returns') return <ReturnsDepartment data={data} onCreateReturn={onCreateReturn} onReceiveReturn={onReceiveReturn} onResolveReturn={onResolveReturn} />;
  if (page === 'access' && role === 'manager') return <AccessDepartment roleAccess={roleAccess} onChange={onRoleAccessChange} />;
  return null;
}
