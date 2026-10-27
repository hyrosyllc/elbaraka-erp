'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, ClipboardList, Copy, List, Mail, MapPinned, PackageCheck, Pencil, Plus, ReceiptText, RotateCcw, UserRoundCheck, UserRoundX } from 'lucide-react';
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
  return <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]"><div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{eyebrow}</p><h2>{title}</h2></div>{count !== undefined && <span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold bg-[#eff3ef] text-[#63746a]">{count}</span>}</div>;
}

function PreviewInventoryDepartment({ data }: { data: WorkspaceData }) {
  const { t, locale } = useLocale();
  const movementItems = [...data.movements].reverse().slice(0, 8);
  return (
    <div className="grid gap-[14px]">
      <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
        <SectionHeading eyebrow={t('navInventory')} title={t('inventorySubtitle')} count={data.items.filter((item) => item.active).length} />
        <div className="w-full overflow-x-auto rounded-md border border-[#e4e9e4]"><table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-[#f7f9f7] [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-[#718078] [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-[#edf0ed] [&_td]:px-3 [&_td]:py-3 [&_td]:text-[#59685f] [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-[#33473d] [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-[10px] [&_td>small]:text-[#89958d] [&_tr:hover]:bg-[#fbfcfb]"><thead><tr><th>{t('item')}</th><th>{t('type')}</th><th>{t('onHand')}</th><th>{t('reserved')}</th><th>{t('quarantined')}</th><th>{t('available')}</th><th>{t('reorderAt')}</th></tr></thead><tbody>
          {data.items.filter((item) => item.active).map((item) => {
            const reserved = data.orders.filter((order) => order.status === 'confirmed').flatMap((order) => order.lines).filter((line) => line.itemId === item.id).reduce((sum, line) => sum + line.quantity, 0);
            return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.sku}</small></td><td>{t(item.type === 'raw_material' ? 'rawMaterial' : item.type === 'blend' ? 'blend' : item.type === 'packaging' ? 'packaging' : 'finishedGood')}</td><td>{formatStock(item.stockOnHand + item.quarantinedStock, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(reserved, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(item.quarantinedStock, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td className={item.stockOnHand - reserved <= item.reorderPoint ? 'font-semibold text-[#a64835]' : ''}>{formatStock(item.stockOnHand - reserved, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(item.reorderPoint, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td></tr>;
          })}
        </tbody></table></div>
      </section>
      <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('auditTrail')} title={t('recentMovements')} count={data.movements.length} />
        {movementItems.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noMovements')}</p> : <div className="divide-y divide-[#edf0ed]">{movementItems.map((movement) => {
          const item = data.items.find((candidate) => candidate.id === movement.itemId);
          return <div className="grid grid-cols-1 items-center gap-2 py-3 text-xs text-[#66736b] min-[761px]:grid-cols-[minmax(80px,.5fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(150px,1fr)] [&>strong]:text-[#3e5347] [&_small]:text-[10px] [&_small]:text-[#89958d]" key={movement.id}><span className={`inline-flex w-fit rounded bg-[#eff3ef] px-2 py-1 font-mono text-[10px] font-semibold ${movement.quantityDelta > 0 ? 'bg-[#eaf3eb] text-[#427250]' : 'bg-[#faece8] text-[#a64835]'}`}>{movement.quantityDelta > 0 ? '+' : ''}{formatStock(movement.quantityDelta, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</span><strong>{item?.name ?? t('item')}</strong><span>{t(movement.kind === 'purchase_receipt' ? 'received' : movement.kind === 'shipment' ? 'delivered' : movement.kind === 'production_output' ? 'completed' : movement.kind === 'customer_return' ? 'inspection' : movement.kind === 'return_release' ? 'released' : 'productionUse')}</span><small>{movement.reference} · {dateLabel(movement.createdAt, locale)}</small></div>;
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

  return <div className="grid gap-[14px]">
    {(role === 'manager' || role === 'purchasing') && <LiveInventoryControls onChanged={() => void loadInventory()} />}
    <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc]">
      <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#fbf2df] text-[#916a20]"><PackageCheck size={18} /></div>
      <div><strong>{loading ? '—' : activeItems.size}</strong><span>{t('activeInventoryItems')}</span></div>
      <div className="mx-[7px] h-[38px] w-px bg-[#dfe5df] max-[520px]:mx-0.5" />
      <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#eaf3eb] text-[#427250]"><ClipboardList size={18} /></div>
      <div><strong>{loading ? '—' : movements.length}</strong><span>{t('recentMovements')}</span></div>
      <div className="ml-auto max-w-[230px] text-[10px] leading-[1.45] text-[#819087] max-[760px]:mt-[3px] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:border-t max-[760px]:border-[#dfe5df] max-[760px]:pt-2">{t('liveInventoryNote')}</div>
    </section>
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
      <SectionHeading eyebrow={t('navInventory')} title={t('inventorySubtitle')} count={activeItems.size} />
      {error && <div className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadInventory()} disabled={loading}>{t('retry')}</Button></div>}
      {loading
        ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]" role="status">{t('loadingInventory')}</p>
        : error && balances.length === 0
          ? null
        : balances.length === 0
          ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noInventoryItems')}</p>
          : <div className="w-full overflow-x-auto rounded-md border border-[#e4e9e4]"><table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-[#f7f9f7] [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-[#718078] [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-[#edf0ed] [&_td]:px-3 [&_td]:py-3 [&_td]:text-[#59685f] [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-[#33473d] [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-[10px] [&_td>small]:text-[#89958d] [&_tr:hover]:bg-[#fbfcfb]">
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
                <td className={available <= Number(balance.reorder_point) ? 'font-semibold text-[#a64835]' : ''}>{formatStock(available, unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td>
                <td>{formatStock(Number(balance.reorder_point), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td>
                <td><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold ${balance.is_active ? 'bg-[#eaf4ed] text-[#35734f]' : 'bg-[#faece8] text-[#a64835]'}`}>{t(balance.is_active ? 'supplierActive' : 'supplierInactive')}</span></td>
              </tr>;
            })}</tbody>
          </table></div>}
    </section>
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
      <SectionHeading eyebrow={t('auditTrail')} title={t('recentMovements')} count={movements.length} />
      {loading
        ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]" role="status">{t('loadingMovements')}</p>
        : error && movements.length === 0
          ? null
        : movements.length === 0
          ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noMovements')}</p>
          : <div className="divide-y divide-[#edf0ed]">{movements.map((movement) => {
            const item = itemById.get(movement.item_id);
            return <div className="grid grid-cols-1 items-center gap-2 py-3 text-xs text-[#66736b] min-[761px]:grid-cols-[minmax(80px,.5fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(150px,1fr)] [&>strong]:text-[#3e5347] [&_small]:text-[10px] [&_small]:text-[#89958d]" key={movement.id}>
              <span className={`inline-flex w-fit rounded bg-[#eff3ef] px-2 py-1 font-mono text-[10px] font-semibold ${Number(movement.quantity_delta) > 0 ? 'bg-[#eaf3eb] text-[#427250]' : 'bg-[#faece8] text-[#a64835]'}`}>{Number(movement.quantity_delta) > 0 ? '+' : ''}{formatStock(Number(movement.quantity_delta), item?.base_unit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</span>
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
  return <div className="supplier-manager"><div className="mb-3 flex items-center justify-between gap-3"><div><strong>{t('suppliers')}</strong><small>{suppliers.length} {t('activeSuppliers')}</small></div><Button className="inline-flex min-h-[29px] items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-[#dfe9e0] bg-white px-2 text-[9px] font-bold text-[#1f6041] hover:bg-[#f0f6f1]" onClick={() => setOpen(!open)}><Plus size={14} />{t('addSupplier')}</Button></div>
    {open && <form className="grid gap-[11px] rounded-md border border-[#dfe5df] bg-[#f8faf8] p-[14px] sm:grid-cols-2 lg:grid-cols-4 sm:flex sm:items-end" onSubmit={submit}><Input aria-label={t('supplierName')} placeholder={t('supplierName')} value={name} onChange={(event) => setName(event.target.value)} required /><Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} /><Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} /><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" type="submit">{t('saveChanges')}</Button></form>}
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

  return <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
    <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]">
      <div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{t('suppliers')}</p><h2>{t('supplierDirectorySubtitle')}</h2></div>
      {canManage && <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" onClick={() => { resetForm(); setOpen(true); }}><Plus size={16} />{t('addSupplier')}</Button>}
    </div>
    <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0"><PackageCheck size={15} />{t('supplierDirectoryLiveNote')}</p>
    {open && canManage && <form className="grid gap-[11px] rounded-md border border-[#dfe5df] bg-[#f8faf8] p-[14px] sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
      <Input aria-label={t('supplierName')} placeholder={t('supplierName')} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
      <Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} />
      <Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
      <Input aria-label={t('leadTimeDays')} placeholder={t('leadTimeDays')} type="number" min="0" max="3650" step="1" value={leadTimeDays} onChange={(event) => setLeadTimeDays(event.target.value)} required />
      <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" type="submit" disabled={saving}>{saving ? t('saving') : t('saveChanges')}</Button>
      <Button variant="outline" type="button" onClick={resetForm} disabled={saving}>{t('cancel')}</Button>
    </form>}
    {error && <div className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadSuppliers()} disabled={loading}>{t('retry')}</Button></div>}
    {notice && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0" role="status"><Check size={15} />{notice}</p>}
    {loading
      ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]" role="status">{t('loadingSuppliers')}</p>
      : suppliers.length === 0
        ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noSuppliers')}</p>
        : <div className="w-full overflow-x-auto rounded-md border border-[#e4e9e4]"><table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-[#f7f9f7] [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-[#718078] [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-[#edf0ed] [&_td]:px-3 [&_td]:py-3 [&_td]:text-[#59685f] [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-[#33473d] [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-[10px] [&_td>small]:text-[#89958d] [&_tr:hover]:bg-[#fbfcfb]">
          <thead><tr><th>{t('supplierName')}</th><th>{t('contact')}</th><th>{t('phone')}</th><th>{t('leadTimeDays')}</th><th>{t('status')}</th>{canManage && <th>{t('actions')}</th>}</tr></thead>
          <tbody>{suppliers.map((supplier) => <tr key={supplier.id}>
            <td><strong>{supplier.name}</strong><small>{supplier.code}</small></td>
            <td>{supplier.contact_name || '—'}</td>
            <td dir="ltr">{supplier.phone || '—'}</td>
            <td>{supplier.lead_time_days} {t('days')}</td>
            <td><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold ${supplier.is_active ? 'bg-[#eaf4ed] text-[#35734f]' : 'bg-[#faece8] text-[#a64835]'}`}>{t(supplier.is_active ? 'supplierActive' : 'supplierInactive')}</span></td>
            {canManage && <td className="flex flex-wrap items-center gap-1.5">
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
      ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]" role="alert">{t('purchasingAccessRequired')}</p>
      : <div className="grid gap-[14px]"><LivePurchasingOperations /><LiveSupplierDirectory canManage /></div>;
  }

  const createDraft = () => {
    if (!supplierId || needs.length === 0) return;
    onCreatePurchase(supplierId, needs.map((need) => ({ itemId: need.item.id, quantity: need.quantity, receivedQuantity: 0, unitCostMad: need.item.baseUnit === 'g' ? 0.08 : 0.4 })));
  };

  return <div className="grid gap-[14px]">
    <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc]"><div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#fbf2df] text-[#916a20]"><CircleAlert size={18} /></div><div><strong>{needs.length}</strong><span>{t('itemsToBuy')}</span></div><div className="mx-[7px] h-[38px] w-px bg-[#dfe5df] max-[520px]:mx-0.5" /><div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#eaf3eb] text-[#427250]"><ClipboardList size={18} /></div><div><strong>{productionNeeds.length}</strong><span>{t('materialNeeds')}</span></div><div className="ml-auto max-w-[230px] text-[10px] leading-[1.45] text-[#819087] max-[760px]:mt-[3px] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:border-t max-[760px]:border-[#dfe5df] max-[760px]:pt-2">{t('purchaseHint')}</div></section>
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('needsAttention')} title={t('stockToBuy')} count={needs.length} />
      {needs.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noNeedToBuy')}</p> : <><div className="w-full overflow-x-auto rounded-md border border-[#e4e9e4]"><table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-[#f7f9f7] [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-[#718078] [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-[#edf0ed] [&_td]:px-3 [&_td]:py-3 [&_td]:text-[#59685f] [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-[#33473d] [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-[10px] [&_td>small]:text-[#89958d] [&_tr:hover]:bg-[#fbfcfb]"><thead><tr><th>{t('item')}</th><th>{t('available')}</th><th>{t('reorderAt')}</th><th>{t('openPurchaseQty')}</th><th>{t('suggestedQty')}</th><th>{t('reason')}</th></tr></thead><tbody>{needs.map((need) => <tr key={need.item.id}><td><strong>{need.item.name}</strong><small>{need.item.sku}</small></td><td className={need.item.stockOnHand <= need.item.reorderPoint ? 'font-semibold text-[#a64835]' : ''}>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(need.item.reorderPoint, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(data.purchaseOrders.flatMap((po) => po.lines).filter((line) => line.itemId === need.item.id).reduce((sum, line) => sum + Math.max(0, line.quantity - line.receivedQuantity), 0), need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td><strong>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></td><td>{need.reasons.map((reason) => t(reason === 'production' ? 'productionReason' : 'reorder')).join(' + ')}</td></tr>)}</tbody></table></div>
        <div className="mt-4 grid items-end gap-3 border-t border-[#e5ebe5] pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]"><label className="grid min-w-0 gap-[7px] text-[10px] font-semibold text-[#5c6b62] [&>span:first-child]:min-h-[13px] [&_small]:text-[9px] [&_small]:font-medium [&_small]:text-[#929d95]"><span>{t('supplier')}</span><Select value={supplierId || 'unselected'} onValueChange={(value) => setSupplierId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('supplier')} /></SelectTrigger><SelectContent>{data.suppliers.filter((supplier) => supplier.active).map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.leadTimeDays} {t('days')}</SelectItem>)}</SelectContent></Select></label><div className="grid gap-1 text-sm [&_small]:text-[10px] [&_small]:text-[#89958d] [&_strong]:font-semibold [&_strong]:text-[#33473d]"><small>{t('estimatedSpend')}</small><strong>{formatMad(estimatedSpend, locale)}</strong></div><Button variant="primary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" onClick={createDraft} disabled={!supplierId}><Plus size={16} />{t('createPurchaseDraft')}</Button></div>
      </>}
    </section>
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('supplierOrders')} title={t('purchaseOrders')} count={data.purchaseOrders.length} />
      {data.purchaseOrders.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noPurchaseOrders')}</p> : <div className="divide-y divide-[#edf0ed] border-t border-[#dfe5df]">{data.purchaseOrders.map((purchase) => <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#394e43] [&_small]:text-[10px] [&_small]:text-[#89958d]" key={purchase.id}><div><div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#738077]"><strong>{purchase.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold ${purchase.status === 'received' ? 'bg-[#eaf4ed] text-[#35734f]' : purchase.status === 'draft' ? 'bg-[#eff3ef] text-[#63746a]' : 'bg-[#fbf2df] text-[#8a651d]'}`}>{t(purchase.status === 'part_received' ? 'partReceived' : purchase.status)}</span></div><h3>{purchase.supplierName}</h3><small>{dateLabel(purchase.createdAt, locale)} · {purchase.lines.length} {t('lines')}</small></div><div className="grid gap-[7px]">{purchase.lines.map((line) => { const item = data.items.find((entry) => entry.id === line.itemId); return <div className="flex items-center justify-between gap-[10px] [&>span]:grid [&>span]:gap-[3px] [&>span]:text-[10px] [&>span]:text-[#69776e] [&_small]:font-mono [&_small]:text-[8px] [&_small]:text-[#9aa49d] [&>strong]:whitespace-nowrap [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#516359]" key={line.itemId}><span>{item?.name}<small>{formatStock(line.receivedQuantity, item?.baseUnit ?? 'g', locale === 'ar' ? 'ar-MA' : 'en-MA')} / {formatStock(line.quantity, item?.baseUnit ?? 'g', locale === 'ar' ? 'ar-MA' : 'en-MA')}</small></span><strong>{formatMad(line.quantity * line.unitCostMad, locale)}</strong></div>; })}</div><div className="flex justify-end max-[920px]:col-start-2 max-[760px]:col-auto [&>.button]:min-h-[34px] [&>.button]:px-[10px] [&>.button]:text-[10px] max-[760px]:[&>.button]:w-full">{purchase.status === 'draft' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onPurchaseOrdered(purchase.id)}>{t('sendPurchase')}</Button> : purchase.status !== 'received' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onReceivePurchase(purchase.id)}><PackageCheck size={15} />{t('markReceived')}</Button> : <span className="inline-flex items-center gap-[5px] text-[10px] font-semibold text-[#518064]"><Check size={15} />{t('received')}</span>}</div></article>)}</div>}
    </section>
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><PreviewSupplierForm suppliers={data.suppliers} onSave={onAddSupplier} /></section>
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
  return <div className="grid gap-[14px]">
    <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc]"><div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#fbf2df] text-[#916a20]"><ClipboardList size={18} /></div><div><strong>{needs.length}</strong><span>{t('finishedGoodsToMake')}</span></div><div className="mx-[7px] h-[38px] w-px bg-[#dfe5df] max-[520px]:mx-0.5" /><div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#eaf3eb] text-[#427250]"><PackageCheck size={18} /></div><div><strong>{materials.length}</strong><span>{t('materialLines')}</span></div><div className="ml-auto max-w-[230px] text-[10px] leading-[1.45] text-[#819087] max-[760px]:mt-[3px] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:border-t max-[760px]:border-[#dfe5df] max-[760px]:pt-2">{t('productionHint')}</div></section>
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('needsAttention')} title={t('workersNeed')} count={needs.length} />
      {needs.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noProductionNeed')}</p> : <div className="divide-y divide-[#edf0ed] border-t border-[#dfe5df]">{needs.map((need) => <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#394e43] [&_small]:text-[10px] [&_small]:text-[#89958d]" key={need.item.id}><div><strong>{need.item.name}</strong><small>{need.item.sku} · {t('reorderAt')} {formatStock(need.item.reorderPoint, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</small></div><div className="grid gap-1 text-[10px] text-[#89958d] [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-[#52645a]"><span>{t('available')}</span><strong>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><div className="grid gap-1 text-[10px] text-[#89958d] [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-[#52645a]"><span>{t('quantity')}</span><strong>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" onClick={() => onCreateProduction(need.item.id, need.quantity)}>{t('createWorkOrder')}</Button></article>)}</div>}
    </section>
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('materials')} title={t('requestedMaterials')} count={materials.length} />
      {materials.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noProductionNeed')}</p> : <div className="w-full overflow-x-auto rounded-md border border-[#e4e9e4]"><table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-[#f7f9f7] [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-[#718078] [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-[#edf0ed] [&_td]:px-3 [&_td]:py-3 [&_td]:text-[#59685f] [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-[#33473d] [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-[10px] [&_td>small]:text-[#89958d] [&_tr:hover]:bg-[#fbfcfb]"><thead><tr><th>{t('item')}</th><th>{t('available')}</th><th>{t('quantity')}</th><th>{t('materialShortage')}</th><th>{t('reason')}</th></tr></thead><tbody>{materials.map((need) => { const shortage = Math.max(0, need.quantity - need.item.stockOnHand); return <tr key={need.item.id}><td><strong>{need.item.name}</strong><small>{need.item.sku}</small></td><td>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td className={shortage > 0 ? 'font-semibold text-[#a64835]' : ''}>{formatStock(shortage, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{need.reasons.join(', ')}</td></tr>; })}</tbody></table></div>}
    </section>
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('production')} title={t('productionQueue')} count={data.productionOrders.length} />
      {data.productionOrders.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noProduction')}</p> : <div className="divide-y divide-[#edf0ed] border-t border-[#dfe5df]">{data.productionOrders.map((order) => { const item = data.items.find((entry) => entry.id === order.itemId); return <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#394e43] [&_small]:text-[10px] [&_small]:text-[#89958d]" key={order.id}><div><div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#738077]"><strong>{order.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold ${order.status === 'completed' ? 'bg-[#eaf4ed] text-[#35734f]' : 'bg-[#fbf2df] text-[#8a651d]'}`}>{t(order.status === 'in_progress' ? 'inProgress' : order.status)}</span></div><h3>{item?.name}</h3></div><div className="grid gap-1 text-[10px] text-[#89958d] [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-[#52645a]"><span>{t('planned')}</span><strong>{formatStock(order.targetQuantity, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><div className="flex justify-end max-[920px]:col-start-2 max-[760px]:col-auto [&>.button]:min-h-[34px] [&>.button]:px-[10px] [&>.button]:text-[10px] max-[760px]:[&>.button]:w-full">{order.status === 'planned' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onStartProduction(order.id)}>{t('startProduction')}</Button> : order.status === 'in_progress' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" onClick={() => onCompleteProduction(order.id)}>{t('completeProduction')}</Button> : <span className="inline-flex items-center gap-[5px] text-[10px] font-semibold text-[#518064]"><Check size={15} />{t('completed')}</span>}</div></article>; })}</div>}
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
  return <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]"><div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{t('navClients')}</p><h2>{t('clientsSubtitle')}</h2></div><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" onClick={() => setOpen(!open)}><Plus size={16} />{t('addClient')}</Button></div>
    {open && <form className="grid gap-[11px] rounded-md border border-[#dfe5df] bg-[#f8faf8] p-[14px] sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}><Input placeholder={t('customerOrStore')} value={name} onChange={(event) => setName(event.target.value)} required /><Input placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} /><Input placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} /><Input placeholder={t('city')} value={city} onChange={(event) => setCity(event.target.value)} /><Input placeholder={t('address')} value={address} onChange={(event) => setAddress(event.target.value)} /><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" type="submit">{t('saveChanges')}</Button></form>}
    <div className="w-full overflow-x-auto rounded-md border border-[#e4e9e4]"><table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-[#f7f9f7] [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-[#718078] [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-[#edf0ed] [&_td]:px-3 [&_td]:py-3 [&_td]:text-[#59685f] [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-[#33473d] [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-[10px] [&_td>small]:text-[#89958d] [&_tr:hover]:bg-[#fbfcfb]"><thead><tr><th>{t('customerOrStore')}</th><th>{t('contact')}</th><th>{t('phone')}</th><th>{t('city')}</th><th>{t('openOrders')}</th><th>{t('outstandingInvoices')}</th></tr></thead><tbody>{data.clients.filter((client) => client.active).map((client) => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.address}</small></td><td>{client.contactName || '—'}</td><td dir="ltr">{client.phone || '—'}</td><td>{client.city || '—'}</td><td>{data.orders.filter((order) => order.clientId === client.id && order.status === 'confirmed').length}</td><td>{formatMad(data.invoices.filter((invoice) => invoice.clientId === client.id).reduce((sum, invoice) => sum + invoice.amountMad - invoice.paidMad, 0), locale)}</td></tr>)}</tbody></table></div>
    {data.clients.length === 0 && <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noClients')}</p>}
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
  const { t, locale } = useLocale();
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
  const [inviteClientId, setInviteClientId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [issuedInvite, setIssuedInvite] = useState<{ clientId: string; email: string; code: string; expiresAt: string } | null>(null);

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

  const createCustomerInvite = async (event: FormEvent<HTMLFormElement>, client: LiveClient) => {
    event.preventDefault();
    setInviteBusy(true);
    setError('');
    setNotice('');
    setIssuedInvite(null);
    try {
      const response = await fetch('/api/admin/customer-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, email: inviteEmail.trim() }),
      });
      const result = await response.json() as {
        invitation?: { email: string; code: string; expiresAt: string };
        error?: string;
      };
      if (!response.ok || !result.invitation) throw new Error(result.error || 'Could not create this invitation.');
      setIssuedInvite({ clientId: client.id, ...result.invitation });
      setInviteEmail('');
      setNotice(t('customerInviteCreated'));
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not create this invitation.');
    } finally {
      setInviteBusy(false);
    }
  };

  const copyCustomerInvite = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(t('customerInviteCopied'));
    } catch {
      setError(t('customerInviteCopyError'));
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

  return <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
    <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]">
      <div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{t('navClients')}</p><h2>{t('clientsSubtitle')}</h2></div>
      <div className="flex items-center gap-3 max-[760px]:flex-col-reverse max-[760px]:items-end">
        <div className="flex items-center gap-[7px] rounded-[7px] border border-[#dfe5df] bg-[#f1f4f1] p-[3px] max-[760px]:self-end" role="group" aria-label={t('clientViews')}>
          <Button variant={showMap ? 'outline' : 'default'} size="sm" onClick={() => setShowMap(false)} aria-pressed={!showMap}>
            <List size={15} />{t('clientListView')}
          </Button>
          <Button variant={showMap ? 'default' : 'outline'} size="sm" onClick={() => setShowMap(true)} aria-pressed={showMap}>
            <MapPinned size={15} />{t('clientMapView')}
          </Button>
        </div>
        {canManage && <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" onClick={() => { resetForm(); setOpen(true); }}><Plus size={16} />{t('addClient')}</Button>}
      </div>
    </div>
    {open && canManage && <form className="grid gap-[11px] rounded-md border border-[#dfe5df] bg-[#f8faf8] p-[14px] sm:grid-cols-2 lg:grid-cols-4 mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-[11px] rounded-[7px] border border-[#dfe5df] bg-[#f8faf8] p-[14px]" onSubmit={submit}>
      <Input aria-label={t('customerOrStore')} placeholder={t('customerOrStore')} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
      <Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} />
      <Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
      <Input aria-label={t('city')} placeholder={t('city')} value={city} onChange={(event) => setCity(event.target.value)} maxLength={120} />
      <Input aria-label={t('address')} placeholder={t('address')} value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} />
      <label className="grid gap-[5px] text-[10px] font-semibold text-[#617168]">
        <span>{t('latitude')}</span>
        <Input aria-label={t('latitude')} type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
      </label>
      <label className="grid gap-[5px] text-[10px] font-semibold text-[#617168]">
        <span>{t('longitude')}</span>
        <Input aria-label={t('longitude')} type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
      </label>
      <p className="col-span-full m-0 mt-[-2px] text-[10px] leading-[1.45] text-[#78867e] max-[760px]:col-auto">{t('clientCoordinateHelp')}</p>
      <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" type="submit" disabled={saving}>{saving ? t('saving') : t('saveChanges')}</Button>
      <Button variant="outline" type="button" onClick={resetForm} disabled={saving}>{t('cancel')}</Button>
    </form>}
    {error && <div className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadClients()} disabled={loading}>{t('retry')}</Button></div>}
    {notice && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0" role="status"><Check size={15} />{notice}</p>}
    {showMap && <>
      <div className="mb-[10px] flex flex-wrap gap-x-[22px] gap-y-2 text-[11px] text-[#59685f] [&_strong]:text-sm [&_strong]:tabular-nums [&_strong]:text-[#1f6041]" role="status">
        <span><strong>{mapLocations.length}</strong> {t('mappedClientStores')}</span>
        <span><strong>{activeClientCount - mapLocations.length}</strong> {t('clientStoresWithoutCoordinates')}</span>
      </div>
      <ClientLocationMap clients={mapLocations} />
    </>}
    {loading
      ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]" role="status">{t('loadingClients')}</p>
      : clients.length === 0
        ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noClients')}</p>
        : <div className="w-full overflow-x-auto rounded-md border border-[#e4e9e4]"><table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-[#f7f9f7] [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-[#718078] [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-[#edf0ed] [&_td]:px-3 [&_td]:py-3 [&_td]:text-[#59685f] [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-[#33473d] [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-[10px] [&_td>small]:text-[#89958d] [&_tr:hover]:bg-[#fbfcfb]">
          <thead><tr><th>{t('customerOrStore')}</th><th>{t('contact')}</th><th>{t('phone')}</th><th>{t('city')}</th>{canManage && <th>{t('actions')}</th>}</tr></thead>
          <tbody>{clients.map((client) => <tr key={client.id}>
            <td><strong>{client.name}</strong><small>{client.address || client.code}</small></td>
            <td>{client.contact_name || '—'}</td>
            <td dir="ltr">{client.phone || '—'}</td>
            <td>{client.city || '—'}</td>
            {canManage && <td className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => editClient(client)} disabled={saving} aria-label={`${t('editClient')}: ${client.name}`}><Pencil size={15} />{t('editClient')}</Button>
              <Button variant="outline" size="sm" onClick={() => void toggleActive(client)} disabled={saving} aria-label={`${t(client.is_active ? 'clientDeactivate' : 'clientReactivate')}: ${client.name}`}>
                {client.is_active ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}{t(client.is_active ? 'clientDeactivate' : 'clientReactivate')}
              </Button>
              {client.is_active && <Button variant="outline" size="sm" onClick={() => {
                setInviteClientId((current) => current === client.id ? null : client.id);
                setInviteEmail('');
                setIssuedInvite(null);
                setError('');
                setNotice('');
              }} disabled={inviteBusy} aria-label={`${t('customerInvite')}: ${client.name}`}><Mail size={15} />{t('customerInvite')}</Button>}
            </td>}
          </tr>)}</tbody>
          {canManage && clients.map((client) => inviteClientId === client.id && client.is_active && <tr key={`${client.id}-invite`}>
            <td colSpan={5}>
              <form className="grid gap-3 rounded-md border border-[#dfe7de] bg-[#f7faf6] p-3 sm:p-4" onSubmit={(event) => void createCustomerInvite(event, client)}>
                <strong className="text-sm text-[#284b35]">{t('customerInvite')} · {client.name}</strong>
                {!issuedInvite || issuedInvite.clientId !== client.id
                  ? <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                    <Label htmlFor={`invite-email-${client.id}`} className="grid w-full max-w-sm gap-2 text-xs font-bold text-[#52645c]">
                      {t('customerInviteEmail')}
                      <Input id={`invite-email-${client.id}`} type="email" autoComplete="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} maxLength={254} required dir="ltr" />
                    </Label>
                    <Button variant="primary" type="submit" disabled={inviteBusy}>{inviteBusy ? t('saving') : t('createCustomerInvite')}</Button>
                    <Button variant="outline" type="button" onClick={() => setInviteClientId(null)} disabled={inviteBusy}>{t('cancel')}</Button>
                  </div>
                  : <div className="flex flex-wrap items-center gap-2 text-xs text-[#536358]">
                    <p className="m-0">{t('customerInviteEmail')}: <bdi>{issuedInvite.email}</bdi></p>
                    <code className="select-all rounded border border-dashed border-[#9ba995] bg-white px-2.5 py-2 text-sm font-bold tracking-wide text-[#203d2c]" dir="ltr">{issuedInvite.code}</code>
                    <span className="text-[11px] text-[#728075]">{t('customerInviteExpires')}: {dateLabel(issuedInvite.expiresAt, locale)}</span>
                    <Button type="button" variant="outline" onClick={() => void copyCustomerInvite(issuedInvite.code)}><Copy size={14} />{t('copyCustomerInvite')}</Button>
                  </div>}
              </form>
            </td>
          </tr>)}
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
  return <div className="grid gap-[14px]"><section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('invoiceNumber')} title={t('createInvoice')} count={uninvoiced.length} />
    {uninvoiced.length > 0 && <div className="divide-y divide-[#edf0ed] border-t border-[#dfe5df]">{uninvoiced.map((note) => <div className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] [&>div]:grid [&>div]:gap-1 [&_strong]:text-xs [&_strong]:text-[#405248] [&_small]:text-[10px] [&_small]:text-[#89958d]" key={note.id}><div><strong>{note.customer}</strong><small>{note.number} · {dateLabel(note.createdAt, locale)}</small></div><strong>{formatMad(note.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMad, 0), locale)}</strong><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onCreateInvoice(note.id)}><ReceiptText size={15} />{t('createInvoice')}</Button></div>)}</div>}
    {uninvoiced.length === 0 && <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noUnbilledDeliveries')}</p>}
  </section><section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('navInvoices')} title={t('outstandingInvoices')} count={data.invoices.length} /><p className="mb-0 mt-[14px] text-[9px] text-[#9aa49d]">{t('notLegalInvoice')}</p>
    {data.invoices.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noInvoices')}</p> : <div className="divide-y divide-[#edf0ed] border-t border-[#dfe5df]">{data.invoices.map((invoice) => { const due = Math.max(0, invoice.amountMad - invoice.paidMad); return <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#394e43] [&_small]:text-[10px] [&_small]:text-[#89958d]" key={invoice.id}><div><div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#738077]"><strong>{invoice.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold ${due === 0 ? 'bg-[#eaf4ed] text-[#35734f]' : 'bg-[#fbf2df] text-[#8a651d]'}`}>{t(due === 0 ? 'paidInFull' : invoice.paidMad > 0 ? 'partiallyPaid' : 'unpaid')}</span></div><h3>{invoice.customer}</h3><small>{invoice.deliveryNumber} · {dateLabel(invoice.issuedAt, locale)}</small></div><div className="grid gap-1 text-[10px] text-[#89958d] [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-[#52645a]"><span>{t('total')}</span><strong>{formatMad(invoice.amountMad, locale)}</strong></div><div className="grid gap-1 text-[10px] text-[#89958d] [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-[#52645a]"><span>{t('balanceDue')}</span><strong>{formatMad(due, locale)}</strong></div>{due > 0 && <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onRecordPayment(invoice.id, due)}>{t('recordPayment')}</Button>}</article>; })}</div>}
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
  return <div className="grid gap-[14px]"><section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('navReturns')} title={t('requestReturn')} count={data.returns.length} /><p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0"><RotateCcw size={15} />{t('pendingInspection')}</p>
    <form className="grid gap-[11px] rounded-md border border-[#dfe5df] bg-[#f8faf8] p-[14px] sm:grid-cols-2 lg:grid-cols-4 grid gap-3 rounded-md border border-[#dfe5df] bg-[#f8faf8] p-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}><Select value={deliveryId || 'unselected'} onValueChange={(value) => { setDeliveryId(value === 'unselected' ? '' : value); setItemId(''); }}><SelectTrigger aria-label={t('selectDelivery')}><SelectValue placeholder={t('selectDelivery')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectDelivery')}</SelectItem>{deliveredNotes.map((note) => <SelectItem key={note.id} value={note.id}>{note.number} · {note.customer}</SelectItem>)}</SelectContent></Select><Select value={itemId || 'unselected'} onValueChange={(value) => setItemId(value === 'unselected' ? '' : value)} disabled={!selectedDelivery}><SelectTrigger aria-label={t('item')}><SelectValue placeholder={t('item')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('item')}</SelectItem>{selectedDelivery?.lines.map((line) => <SelectItem key={line.itemId} value={line.itemId}>{line.name}</SelectItem>)}</SelectContent></Select><Input type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label={t('quantity')} required /><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('returnReason')} required /><Button variant="primary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" type="submit">{t('requestReturn')}</Button></form>
  </section><section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('inspection')} title={t('navReturns')} count={data.returns.length} />
    {data.returns.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-[#7f8b83]">{t('noReturns')}</p> : <div className="divide-y divide-[#edf0ed] border-t border-[#dfe5df]">{data.returns.map((record) => <ReturnRecord key={record.id} record={record} data={data} onReceive={onReceiveReturn} onResolve={onResolveReturn} />)}</div>}
  </section></div>;
}

function ReturnRecord({ record, data, onReceive, onResolve }: { record: CustomerReturn; data: WorkspaceData; onReceive: (id: string) => void; onResolve: (id: string, decision: 'release' | 'reject') => void }) {
  const { t, locale } = useLocale();
  return <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#394e43] [&_small]:text-[10px] [&_small]:text-[#89958d]"><div><div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#738077]"><strong>{record.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold ${record.status === 'released' ? 'bg-[#eaf4ed] text-[#35734f]' : record.status === 'rejected' ? 'bg-[#faece8] text-[#a64835]' : 'bg-[#fbf2df] text-[#8a651d]'}`}>{t(record.status)}</span></div><h3>{record.customer}</h3><small>{record.deliveryNumber} · {record.reason}</small></div><div className="grid gap-[7px]">{record.lines.map((line) => { const item = data.items.find((candidate) => candidate.id === line.itemId); return <div className="flex items-center justify-between gap-[10px] [&>span]:grid [&>span]:gap-[3px] [&>span]:text-[10px] [&>span]:text-[#69776e] [&_small]:font-mono [&_small]:text-[8px] [&_small]:text-[#9aa49d] [&>strong]:whitespace-nowrap [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#516359]" key={line.itemId}><span>{item?.name}</span><strong>{formatStock(line.quantity, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div>; })}</div><div className="flex justify-end max-[920px]:col-start-2 max-[760px]:col-auto [&>.button]:min-h-[34px] [&>.button]:px-[10px] [&>.button]:text-[10px] max-[760px]:[&>.button]:w-full">{record.status === 'requested' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onReceive(record.id)}>{t('inspectReturn')}</Button> : record.status === 'inspection' ? <div className="flex flex-wrap gap-2"><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onResolve(record.id, 'release')}>{t('releaseReturn')}</Button><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onResolve(record.id, 'reject')}>{t('rejectReturn')}</Button></div> : <span className="inline-flex items-center gap-[5px] text-[10px] font-semibold text-[#518064]"><Check size={14} />{t(record.status)}</span>}</div></article>;
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
  return <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('navAccess')} title={t('accessSubtitle')} /><div className="mt-3 rounded-md border border-[#f0e6cc] bg-[#faf5e8] p-3 text-[10px] leading-relaxed text-[#7c6a3a]"><CircleAlert size={16} /><p>{t('accessNote')}</p></div><div className="grid gap-2"><div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(70px,auto))] items-center gap-3 border-b border-[#edf0ed] py-2 text-xs text-[#59685f] grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(70px,auto))] gap-3 border-b border-[#dfe5df] pb-2 text-[10px] font-semibold text-[#718078]"><span>{t('navigation')}</span>{roles.map((role) => <strong key={role}>{t(ROLE_LABEL_KEYS[role])}</strong>)}</div>{WORKSPACE_PAGES.map((page) => <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(70px,auto))] items-center gap-3 border-b border-[#edf0ed] py-2 text-xs text-[#59685f]" key={page}><span>{t(PAGE_LABEL_KEYS[page])}</span>{roles.map((role) => <label className="mx-auto" key={`${page}-${role}`}><Checkbox checked={roleAccess[role].includes(page)} disabled={page === 'overview'} onCheckedChange={() => toggle(role, page)} aria-label={`${t(ROLE_LABEL_KEYS[role])}: ${t(PAGE_LABEL_KEYS[page])}`} /><span /></label>)}</div>)}</div><p className="mb-0 mt-[14px] text-[9px] text-[#9aa49d]">{t('accessPreviewOnly')}</p></section>;
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
