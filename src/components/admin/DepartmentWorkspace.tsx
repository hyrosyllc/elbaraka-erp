'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { FormEvent, useEffect, useState } from 'react';
import { Check, CircleAlert, ClipboardList, PackageCheck, Pencil, Plus, ReceiptText, RotateCcw, UserRoundCheck, UserRoundX } from 'lucide-react';
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
import { LiveInventoryControls } from './LiveInventoryControls';
import { LivePurchasingOperations } from './LivePurchasingOperations';
import { SupplierPayablesPanel } from './SupplierPayablesPanel';
import { StockNeedsPanel } from './StockNeedsPanel';
import { ClientAccountManager } from './ClientAccountManager';
import { ClientsViews } from './ClientsViews';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function dateLabel(iso: string, locale: 'en' | 'ar') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'en-MA', { dateStyle: 'medium' }).format(new Date(iso));
}

function SectionHeading({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) {
  return <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-foreground [&>svg]:text-subtle"><div><p className="m-0 text-caption font-bold tracking-[.35px] text-subtle">{eyebrow}</p><h2>{title}</h2></div>{count !== undefined && <span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold bg-muted text-muted-foreground">{count}</span>}</div>;
}

function PreviewInventoryDepartment({ data }: { data: WorkspaceData }) {
  const { t, locale } = useLocale();
  const movementItems = [...data.movements].reverse().slice(0, 8);
  return (
    <div className="grid gap-[14px]">
      <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
        <SectionHeading eyebrow={t('navInventory')} title={t('inventorySubtitle')} count={data.items.filter((item) => item.active).length} />
        <div className="w-full overflow-x-auto rounded-md border border-border"><Table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-surface [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-subtle [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-divider [&_td]:px-3 [&_td]:py-3 [&_td]:text-muted-foreground [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-primary [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-caption [&_td>small]:text-subtle [&_tr:hover]:bg-card"><TableHeader><TableRow><TableHead>{t('item')}</TableHead><TableHead>{t('type')}</TableHead><TableHead>{t('onHand')}</TableHead><TableHead>{t('reserved')}</TableHead><TableHead>{t('quarantined')}</TableHead><TableHead>{t('available')}</TableHead><TableHead>{t('reorderAt')}</TableHead></TableRow></TableHeader><TableBody>
          {data.items.filter((item) => item.active).map((item) => {
            const reserved = data.orders.filter((order) => order.status === 'confirmed').flatMap((order) => order.lines).filter((line) => line.itemId === item.id).reduce((sum, line) => sum + line.quantity, 0);
            return <TableRow key={item.id}><TableCell><strong>{item.name}</strong><small>{item.sku}</small></TableCell><TableCell>{t(item.type === 'raw_material' ? 'rawMaterial' : item.type === 'blend' ? 'blend' : item.type === 'packaging' ? 'packaging' : 'finishedGood')}</TableCell><TableCell>{formatStock(item.stockOnHand + item.quarantinedStock, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell>{formatStock(reserved, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell>{formatStock(item.quarantinedStock, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell className={item.stockOnHand - reserved <= item.reorderPoint ? 'font-semibold text-destructive' : ''}>{formatStock(item.stockOnHand - reserved, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell>{formatStock(item.reorderPoint, item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell></TableRow>;
          })}
        </TableBody></Table></div>
      </section>
      <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('auditTrail')} title={t('recentMovements')} count={data.movements.length} />
        {movementItems.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noMovements')}</p> : <div className="divide-y divide-divider">{movementItems.map((movement) => {
          const item = data.items.find((candidate) => candidate.id === movement.itemId);
          return <div className="grid grid-cols-1 items-center gap-2 py-3 text-xs text-muted-foreground min-[761px]:grid-cols-[minmax(80px,.5fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(150px,1fr)] [&>strong]:text-muted-foreground [&_small]:text-caption [&_small]:text-subtle" key={movement.id}><span className={`inline-flex w-fit rounded bg-muted px-2 py-1 font-mono text-caption font-semibold ${movement.quantityDelta > 0 ? 'bg-secondary text-success' : 'bg-destructive-soft text-destructive'}`}>{movement.quantityDelta > 0 ? '+' : ''}{formatStock(movement.quantityDelta, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</span><strong>{item?.name ?? t('item')}</strong><span>{t(movement.kind === 'purchase_receipt' ? 'received' : movement.kind === 'shipment' ? 'delivered' : movement.kind === 'production_output' ? 'completed' : movement.kind === 'customer_return' ? 'inspection' : movement.kind === 'return_release' ? 'released' : 'productionUse')}</span><small>{movement.reference} · {dateLabel(movement.createdAt, locale)}</small></div>;
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
    <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-border bg-card px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-border bg-card">
      <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-accent text-accent-foreground"><PackageCheck size={18} /></div>
      <div><strong>{loading ? '—' : activeItems.size}</strong><span>{t('activeInventoryItems')}</span></div>
      <div className="mx-[7px] h-[38px] w-px bg-border max-[520px]:mx-0.5" />
      <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-secondary text-success"><ClipboardList size={18} /></div>
      <div><strong>{loading ? '—' : movements.length}</strong><span>{t('recentMovements')}</span></div>
      <div className="ml-auto max-w-[230px] text-caption leading-[1.45] text-subtle max-[760px]:mt-[3px] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:border-t max-[760px]:border-border max-[760px]:pt-2">{t('liveInventoryNote')}</div>
    </section>
    <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
      <SectionHeading eyebrow={t('navInventory')} title={t('inventorySubtitle')} count={activeItems.size} />
      {error && <div className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadInventory()} disabled={loading}>{t('retry')}</Button></div>}
      {loading
        ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle" role="status">{t('loadingInventory')}</p>
        : error && balances.length === 0
          ? null
        : balances.length === 0
          ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noInventoryItems')}</p>
          : <div className="w-full overflow-x-auto rounded-md border border-border"><Table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-surface [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-subtle [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-divider [&_td]:px-3 [&_td]:py-3 [&_td]:text-muted-foreground [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-primary [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-caption [&_td>small]:text-subtle [&_tr:hover]:bg-card">
            <TableHeader><TableRow><TableHead>{t('item')}</TableHead><TableHead>{t('location')}</TableHead><TableHead>{t('type')}</TableHead><TableHead>{t('onHand')}</TableHead><TableHead>{t('reserved')}</TableHead><TableHead>{t('quarantined')}</TableHead><TableHead>{t('available')}</TableHead><TableHead>{t('reorderAt')}</TableHead><TableHead>{t('status')}</TableHead></TableRow></TableHeader>
            <TableBody>{balances.map((balance) => {
              const available = Number(balance.available);
              const unit = balance.base_unit;
              return <TableRow key={`${balance.item_id}-${balance.location_id ?? 'unlocated'}`}>
                <TableCell><strong>{balance.name}</strong><small>{balance.sku}</small></TableCell>
                <TableCell>{balance.location_name ?? t('noLocation')}</TableCell>
                <TableCell>{t(balance.item_type === 'raw_material' ? 'rawMaterial' : balance.item_type === 'blend' ? 'blend' : balance.item_type === 'packaging' ? 'packaging' : 'finishedGood')}</TableCell>
                <TableCell>{formatStock(Number(balance.on_hand), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell>
                <TableCell>{formatStock(Number(balance.reserved), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell>
                <TableCell>{formatStock(Number(balance.quarantined), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell>
                <TableCell className={available <= Number(balance.reorder_point) ? 'font-semibold text-destructive' : ''}>{formatStock(available, unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell>
                <TableCell>{formatStock(Number(balance.reorder_point), unit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell>
                <TableCell><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold ${balance.is_active ? 'bg-secondary text-success' : 'bg-destructive-soft text-destructive'}`}>{t(balance.is_active ? 'supplierActive' : 'supplierInactive')}</span></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>}
    </section>
    <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
      <SectionHeading eyebrow={t('auditTrail')} title={t('recentMovements')} count={movements.length} />
      {loading
        ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle" role="status">{t('loadingMovements')}</p>
        : error && movements.length === 0
          ? null
        : movements.length === 0
          ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noMovements')}</p>
          : <div className="divide-y divide-divider">{movements.map((movement) => {
            const item = itemById.get(movement.item_id);
            return <div className="grid grid-cols-1 items-center gap-2 py-3 text-xs text-muted-foreground min-[761px]:grid-cols-[minmax(80px,.5fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(150px,1fr)] [&>strong]:text-muted-foreground [&_small]:text-caption [&_small]:text-subtle" key={movement.id}>
              <span className={`inline-flex w-fit rounded bg-muted px-2 py-1 font-mono text-caption font-semibold ${Number(movement.quantity_delta) > 0 ? 'bg-secondary text-success' : 'bg-destructive-soft text-destructive'}`}>{Number(movement.quantity_delta) > 0 ? '+' : ''}{formatStock(Number(movement.quantity_delta), item?.base_unit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</span>
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
  return <div className="supplier-manager"><div className="mb-3 flex items-center justify-between gap-3"><div><strong>{t('suppliers')}</strong><small>{suppliers.length} {t('activeSuppliers')}</small></div><Button className="inline-flex min-h-[29px] items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-border bg-card px-2 font-bold text-primary hover:bg-background" onClick={() => setOpen(!open)}><Plus size={14} />{t('addSupplier')}</Button></div>
    {open && <form className="grid gap-[11px] rounded-md border border-border bg-surface p-[14px] sm:grid-cols-2 lg:grid-cols-4 sm:flex sm:items-end" onSubmit={submit}><Input aria-label={t('supplierName')} placeholder={t('supplierName')} value={name} onChange={(event) => setName(event.target.value)} required /><Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} /><Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} /><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" type="submit">{t('saveChanges')}</Button></form>}
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

  return <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
    <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-foreground [&>svg]:text-subtle">
      <div><p className="m-0 text-caption font-bold tracking-[.35px] text-subtle">{t('suppliers')}</p><h2>{t('supplierDirectorySubtitle')}</h2></div>
      {canManage && <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" onClick={() => { resetForm(); setOpen(true); }}><Plus size={16} />{t('addSupplier')}</Button>}
    </div>
    <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0"><PackageCheck size={15} />{t('supplierDirectoryLiveNote')}</p>
    {open && canManage && <form className="grid gap-[11px] rounded-md border border-border bg-surface p-[14px] sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
      <Input aria-label={t('supplierName')} placeholder={t('supplierName')} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
      <Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} />
      <Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
      <Input aria-label={t('leadTimeDays')} placeholder={t('leadTimeDays')} type="number" min="0" max="3650" step="1" value={leadTimeDays} onChange={(event) => setLeadTimeDays(event.target.value)} required />
      <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" type="submit" disabled={saving}>{saving ? t('saving') : t('saveChanges')}</Button>
      <Button variant="outline" type="button" onClick={resetForm} disabled={saving}>{t('cancel')}</Button>
    </form>}
    {error && <div className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadSuppliers()} disabled={loading}>{t('retry')}</Button></div>}
    {notice && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0" role="status"><Check size={15} />{notice}</p>}
    {loading
      ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle" role="status">{t('loadingSuppliers')}</p>
      : suppliers.length === 0
        ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noSuppliers')}</p>
        : <div className="w-full overflow-x-auto rounded-md border border-border"><Table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-surface [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-subtle [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-divider [&_td]:px-3 [&_td]:py-3 [&_td]:text-muted-foreground [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-primary [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-caption [&_td>small]:text-subtle [&_tr:hover]:bg-card">
          <TableHeader><TableRow><TableHead>{t('supplierName')}</TableHead><TableHead>{t('contact')}</TableHead><TableHead>{t('phone')}</TableHead><TableHead>{t('leadTimeDays')}</TableHead><TableHead>{t('status')}</TableHead>{canManage && <TableHead>{t('actions')}</TableHead>}</TableRow></TableHeader>
          <TableBody>{suppliers.map((supplier) => <TableRow key={supplier.id}>
            <TableCell><strong>{supplier.name}</strong><small>{supplier.code}</small></TableCell>
            <TableCell>{supplier.contact_name || '—'}</TableCell>
            <TableCell dir="ltr">{supplier.phone || '—'}</TableCell>
            <TableCell>{supplier.lead_time_days} {t('days')}</TableCell>
            <TableCell><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold ${supplier.is_active ? 'bg-secondary text-success' : 'bg-destructive-soft text-destructive'}`}>{t(supplier.is_active ? 'supplierActive' : 'supplierInactive')}</span></TableCell>
            {canManage && <TableCell className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => editSupplier(supplier)} disabled={saving} aria-label={`${t('editSupplier')}: ${supplier.name}`}><Pencil size={15} />{t('editSupplier')}</Button>
              <Button variant="outline" size="sm" onClick={() => void toggleActive(supplier)} disabled={saving} aria-label={`${t(supplier.is_active ? 'supplierDeactivate' : 'supplierReactivate')}: ${supplier.name}`}>
                {supplier.is_active ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}{t(supplier.is_active ? 'supplierDeactivate' : 'supplierReactivate')}
              </Button>
            </TableCell>}
          </TableRow>)}</TableBody>
        </Table></div>}
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
      ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle" role="alert">{t('purchasingAccessRequired')}</p>
      : <div className="grid gap-[14px]"><StockNeedsPanel /><LivePurchasingOperations /><SupplierPayablesPanel /><LiveSupplierDirectory canManage /></div>;
  }

  const createDraft = () => {
    if (!supplierId || needs.length === 0) return;
    onCreatePurchase(supplierId, needs.map((need) => ({ itemId: need.item.id, quantity: need.quantity, receivedQuantity: 0, unitCostMad: need.item.baseUnit === 'g' ? 0.08 : 0.4 })));
  };

  return <div className="grid gap-[14px]">
    <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-border bg-card px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-border bg-card"><div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-accent text-accent-foreground"><CircleAlert size={18} /></div><div><strong>{needs.length}</strong><span>{t('itemsToBuy')}</span></div><div className="mx-[7px] h-[38px] w-px bg-border max-[520px]:mx-0.5" /><div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-secondary text-success"><ClipboardList size={18} /></div><div><strong>{productionNeeds.length}</strong><span>{t('materialNeeds')}</span></div><div className="ml-auto max-w-[230px] text-caption leading-[1.45] text-subtle max-[760px]:mt-[3px] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:border-t max-[760px]:border-border max-[760px]:pt-2">{t('purchaseHint')}</div></section>
    <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('needsAttention')} title={t('stockToBuy')} count={needs.length} />
      {needs.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noNeedToBuy')}</p> : <><div className="w-full overflow-x-auto rounded-md border border-border"><Table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-surface [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-subtle [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-divider [&_td]:px-3 [&_td]:py-3 [&_td]:text-muted-foreground [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-primary [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-caption [&_td>small]:text-subtle [&_tr:hover]:bg-card"><TableHeader><TableRow><TableHead>{t('item')}</TableHead><TableHead>{t('available')}</TableHead><TableHead>{t('reorderAt')}</TableHead><TableHead>{t('openPurchaseQty')}</TableHead><TableHead>{t('suggestedQty')}</TableHead><TableHead>{t('reason')}</TableHead></TableRow></TableHeader><TableBody>{needs.map((need) => <TableRow key={need.item.id}><TableCell><strong>{need.item.name}</strong><small>{need.item.sku}</small></TableCell><TableCell className={need.item.stockOnHand <= need.item.reorderPoint ? 'font-semibold text-destructive' : ''}>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell>{formatStock(need.item.reorderPoint, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell>{formatStock(data.purchaseOrders.flatMap((po) => po.lines).filter((line) => line.itemId === need.item.id).reduce((sum, line) => sum + Math.max(0, line.quantity - line.receivedQuantity), 0), need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell><strong>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></TableCell><TableCell>{need.reasons.map((reason) => t(reason === 'production' ? 'productionReason' : 'reorder')).join(' + ')}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="mt-4 grid items-end gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]"><Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>{t('supplier')}</span><Select value={supplierId || 'unselected'} onValueChange={(value) => setSupplierId(value === 'unselected' ? '' : value)}><SelectTrigger><SelectValue placeholder={t('supplier')} /></SelectTrigger><SelectContent>{data.suppliers.filter((supplier) => supplier.active).map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.leadTimeDays} {t('days')}</SelectItem>)}</SelectContent></Select></Label><div className="grid gap-1 text-sm [&_small]:text-caption [&_small]:text-subtle [&_strong]:font-semibold [&_strong]:text-primary"><small>{t('estimatedSpend')}</small><strong>{formatMad(estimatedSpend, locale)}</strong></div><Button variant="primary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" onClick={createDraft} disabled={!supplierId}><Plus size={16} />{t('createPurchaseDraft')}</Button></div>
      </>}
    </section>
    <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('supplierOrders')} title={t('purchaseOrders')} count={data.purchaseOrders.length} />
      {data.purchaseOrders.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noPurchaseOrders')}</p> : <div className="divide-y divide-divider border-t border-border">{data.purchaseOrders.map((purchase) => <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-primary [&_small]:text-caption [&_small]:text-subtle" key={purchase.id}><div><div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-subtle"><strong>{purchase.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold ${purchase.status === 'received' ? 'bg-secondary text-success' : purchase.status === 'draft' ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground'}`}>{t(purchase.status === 'part_received' ? 'partReceived' : purchase.status)}</span></div><h3>{purchase.supplierName}</h3><small>{dateLabel(purchase.createdAt, locale)} · {purchase.lines.length} {t('lines')}</small></div><div className="grid gap-[7px]">{purchase.lines.map((line) => { const item = data.items.find((entry) => entry.id === line.itemId); return <div className="flex items-center justify-between gap-[10px] [&>span]:grid [&>span]:gap-[3px] [&>span]:text-caption [&>span]:text-subtle [&_small]:font-mono [&_small]:text-micro [&_small]:text-subtle [&>strong]:whitespace-nowrap [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-muted-foreground" key={line.itemId}><span>{item?.name}<small>{formatStock(line.receivedQuantity, item?.baseUnit ?? 'g', locale === 'ar' ? 'ar-MA' : 'en-MA')} / {formatStock(line.quantity, item?.baseUnit ?? 'g', locale === 'ar' ? 'ar-MA' : 'en-MA')}</small></span><strong>{formatMad(line.quantity * line.unitCostMad, locale)}</strong></div>; })}</div><div className="flex justify-end max-[920px]:col-start-2 max-[760px]:col-auto [&>.button]:min-h-[34px] [&>.button]:px-[10px] [&>.button]:text-caption max-[760px]:[&>.button]:w-full">{purchase.status === 'draft' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onPurchaseOrdered(purchase.id)}>{t('sendPurchase')}</Button> : purchase.status !== 'received' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onReceivePurchase(purchase.id)}><PackageCheck size={15} />{t('markReceived')}</Button> : <span className="inline-flex items-center gap-[5px] text-caption font-semibold text-muted-foreground"><Check size={15} />{t('received')}</span>}</div></article>)}</div>}
    </section>
    <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><PreviewSupplierForm suppliers={data.suppliers} onSave={onAddSupplier} /></section>
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
    <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-border bg-card px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-border bg-card"><div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-accent text-accent-foreground"><ClipboardList size={18} /></div><div><strong>{needs.length}</strong><span>{t('finishedGoodsToMake')}</span></div><div className="mx-[7px] h-[38px] w-px bg-border max-[520px]:mx-0.5" /><div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-secondary text-success"><PackageCheck size={18} /></div><div><strong>{materials.length}</strong><span>{t('materialLines')}</span></div><div className="ml-auto max-w-[230px] text-caption leading-[1.45] text-subtle max-[760px]:mt-[3px] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:border-t max-[760px]:border-border max-[760px]:pt-2">{t('productionHint')}</div></section>
    <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('needsAttention')} title={t('workersNeed')} count={needs.length} />
      {needs.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noProductionNeed')}</p> : <div className="divide-y divide-divider border-t border-border">{needs.map((need) => <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-primary [&_small]:text-caption [&_small]:text-subtle" key={need.item.id}><div><strong>{need.item.name}</strong><small>{need.item.sku} · {t('reorderAt')} {formatStock(need.item.reorderPoint, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</small></div><div className="grid gap-1 text-caption text-subtle [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-muted-foreground"><span>{t('available')}</span><strong>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><div className="grid gap-1 text-caption text-subtle [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-muted-foreground"><span>{t('quantity')}</span><strong>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" onClick={() => onCreateProduction(need.item.id, need.quantity)}>{t('createWorkOrder')}</Button></article>)}</div>}
    </section>
    <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('materials')} title={t('requestedMaterials')} count={materials.length} />
      {materials.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noProductionNeed')}</p> : <div className="w-full overflow-x-auto rounded-md border border-border"><Table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-surface [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-subtle [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-divider [&_td]:px-3 [&_td]:py-3 [&_td]:text-muted-foreground [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-primary [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-caption [&_td>small]:text-subtle [&_tr:hover]:bg-card"><TableHeader><TableRow><TableHead>{t('item')}</TableHead><TableHead>{t('available')}</TableHead><TableHead>{t('quantity')}</TableHead><TableHead>{t('materialShortage')}</TableHead><TableHead>{t('reason')}</TableHead></TableRow></TableHeader><TableBody>{materials.map((need) => { const shortage = Math.max(0, need.quantity - need.item.stockOnHand); return <TableRow key={need.item.id}><TableCell><strong>{need.item.name}</strong><small>{need.item.sku}</small></TableCell><TableCell>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell className={shortage > 0 ? 'font-semibold text-destructive' : ''}>{formatStock(shortage, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</TableCell><TableCell>{need.reasons.join(', ')}</TableCell></TableRow>; })}</TableBody></Table></div>}
    </section>
    <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('production')} title={t('productionQueue')} count={data.productionOrders.length} />
      {data.productionOrders.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noProduction')}</p> : <div className="divide-y divide-divider border-t border-border">{data.productionOrders.map((order) => { const item = data.items.find((entry) => entry.id === order.itemId); return <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-primary [&_small]:text-caption [&_small]:text-subtle" key={order.id}><div><div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-subtle"><strong>{order.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold ${order.status === 'completed' ? 'bg-secondary text-success' : 'bg-accent text-accent-foreground'}`}>{t(order.status === 'in_progress' ? 'inProgress' : order.status)}</span></div><h3>{item?.name}</h3></div><div className="grid gap-1 text-caption text-subtle [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-muted-foreground"><span>{t('planned')}</span><strong>{formatStock(order.targetQuantity, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><div className="flex justify-end max-[920px]:col-start-2 max-[760px]:col-auto [&>.button]:min-h-[34px] [&>.button]:px-[10px] [&>.button]:text-caption max-[760px]:[&>.button]:w-full">{order.status === 'planned' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onStartProduction(order.id)}>{t('startProduction')}</Button> : order.status === 'in_progress' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" onClick={() => onCompleteProduction(order.id)}>{t('completeProduction')}</Button> : <span className="inline-flex items-center gap-[5px] text-caption font-semibold text-muted-foreground"><Check size={15} />{t('completed')}</span>}</div></article>; })}</div>}
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
  return <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-foreground [&>svg]:text-subtle"><div><p className="m-0 text-caption font-bold tracking-[.35px] text-subtle">{t('navClients')}</p><h2>{t('clientsSubtitle')}</h2></div><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" onClick={() => setOpen(!open)}><Plus size={16} />{t('addClient')}</Button></div>
    {open && <form className="grid gap-[11px] rounded-md border border-border bg-surface p-[14px] sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}><Input placeholder={t('customerOrStore')} value={name} onChange={(event) => setName(event.target.value)} required /><Input placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} /><Input placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} /><Input placeholder={t('city')} value={city} onChange={(event) => setCity(event.target.value)} /><Input placeholder={t('address')} value={address} onChange={(event) => setAddress(event.target.value)} /><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" type="submit">{t('saveChanges')}</Button></form>}
    <div className="w-full overflow-x-auto rounded-md border border-border"><Table className="w-full min-w-max border-collapse text-start text-xs [&_th]:h-10 [&_th]:bg-surface [&_th]:px-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-subtle [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-divider [&_td]:px-3 [&_td]:py-3 [&_td]:text-muted-foreground [&_td>strong]:block [&_td>strong]:font-semibold [&_td>strong]:text-primary [&_td>small]:mt-1 [&_td>small]:block [&_td>small]:text-caption [&_td>small]:text-subtle [&_tr:hover]:bg-card"><TableHeader><TableRow><TableHead>{t('customerOrStore')}</TableHead><TableHead>{t('contact')}</TableHead><TableHead>{t('phone')}</TableHead><TableHead>{t('city')}</TableHead><TableHead>{t('openOrders')}</TableHead><TableHead>{t('outstandingInvoices')}</TableHead></TableRow></TableHeader><TableBody>{data.clients.filter((client) => client.active).map((client) => <TableRow key={client.id}><TableCell><strong>{client.name}</strong><small>{client.address}</small></TableCell><TableCell>{client.contactName || '—'}</TableCell><TableCell dir="ltr">{client.phone || '—'}</TableCell><TableCell>{client.city || '—'}</TableCell><TableCell>{data.orders.filter((order) => order.clientId === client.id && order.status === 'confirmed').length}</TableCell><TableCell>{formatMad(data.invoices.filter((invoice) => invoice.clientId === client.id).reduce((sum, invoice) => sum + invoice.amountMad - invoice.paidMad, 0), locale)}</TableCell></TableRow>)}</TableBody></Table></div>
    {data.clients.length === 0 && <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noClients')}</p>}
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
  account_status?: 'active' | 'invited' | 'none';
  account_count?: number;
  metrics?: import('./ClientsViews').ViewClient['metrics'];
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
  const [accountClientId, setAccountClientId] = useState<string | null>(null);

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

  // Pick up portal sign-ups made in another tab without a manual reload.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void fetch('/api/operations/clients', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() as Promise<{ clients?: LiveClient[] }> : null))
        .then((result) => { if (result?.clients) setClients(result.clients); })
        .catch(() => undefined);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
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
      if (!editingId) setAccountClientId(savedClient.id);
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

  return <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
    <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-foreground [&>svg]:text-subtle">
      <div><p className="m-0 text-caption font-bold tracking-[.35px] text-subtle">{t('navClients')}</p><h2>{t('clientsSubtitle')}</h2></div>
      <div className="flex items-center gap-3 max-[760px]:flex-col-reverse max-[760px]:items-end">
        {canManage && <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" onClick={() => { resetForm(); setOpen(true); }}><Plus size={16} />{t('addClient')}</Button>}
      </div>
    </div>
    {open && canManage && <form className="grid gap-[11px] rounded-md border border-border bg-surface p-[14px] sm:grid-cols-2 lg:grid-cols-4 mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-[11px] rounded-[7px] border border-border bg-surface p-[14px]" onSubmit={submit}>
      <Input aria-label={t('customerOrStore')} placeholder={t('customerOrStore')} value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
      <Input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} />
      <Input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
      <Input aria-label={t('city')} placeholder={t('city')} value={city} onChange={(event) => setCity(event.target.value)} maxLength={120} />
      <Input aria-label={t('address')} placeholder={t('address')} value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} />
      <Label className="grid gap-[5px] text-caption font-semibold text-muted-foreground">
        <span>{t('latitude')}</span>
        <Input aria-label={t('latitude')} type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
      </Label>
      <Label className="grid gap-[5px] text-caption font-semibold text-muted-foreground">
        <span>{t('longitude')}</span>
        <Input aria-label={t('longitude')} type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
      </Label>
      <p className="col-span-full m-0 mt-[-2px] text-caption leading-[1.45] text-subtle max-[760px]:col-auto">{t('clientCoordinateHelp')}</p>
      <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" type="submit" disabled={saving}>{saving ? t('saving') : t('saveChanges')}</Button>
      <Button variant="outline" type="button" onClick={resetForm} disabled={saving}>{t('cancel')}</Button>
    </form>}
    {error && <div className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0" role="alert"><CircleAlert size={15} />{error}<Button variant="outline" onClick={() => void loadClients()} disabled={loading}>{t('retry')}</Button></div>}
    {notice && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0" role="status"><Check size={15} />{notice}</p>}
    {loading
      ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle" role="status">{t('loadingClients')}</p>
      : clients.length === 0
        ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noClients')}</p>
        : <ClientsViews clients={clients} canManage={canManage} saving={saving} onEdit={(id) => { const client = clients.find((entry) => entry.id === id); if (client) editClient(client); }} onToggle={(id) => { const client = clients.find((entry) => entry.id === id); if (client) void toggleActive(client); }} onAccount={setAccountClientId} />}
    <Dialog open={accountClientId !== null} onOpenChange={(next) => { if (!next) { setAccountClientId(null); void loadClients(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t('customerAccountDetails')}</DialogTitle><DialogDescription>{clients.find((client) => client.id === accountClientId)?.name}</DialogDescription></DialogHeader>
        <DialogBody>
          {canManage && accountClientId && (() => {
            const client = clients.find((entry) => entry.id === accountClientId);
            return client ? <ClientAccountManager clientId={client.id} clientName={client.name} clientActive={client.is_active} /> : null;
          })()}
        </DialogBody>
      </DialogContent>
    </Dialog>
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
  return <div className="grid gap-[14px]"><section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('invoiceNumber')} title={t('createInvoice')} count={uninvoiced.length} />
    {uninvoiced.length > 0 && <div className="divide-y divide-divider border-t border-border">{uninvoiced.map((note) => <div className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] [&>div]:grid [&>div]:gap-1 [&_strong]:text-xs [&_strong]:text-muted-foreground [&_small]:text-caption [&_small]:text-subtle" key={note.id}><div><strong>{note.customer}</strong><small>{note.number} · {dateLabel(note.createdAt, locale)}</small></div><strong>{formatMad(note.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMad, 0), locale)}</strong><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onCreateInvoice(note.id)}><ReceiptText size={15} />{t('createInvoice')}</Button></div>)}</div>}
    {uninvoiced.length === 0 && <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noUnbilledDeliveries')}</p>}
  </section><section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('navInvoices')} title={t('outstandingInvoices')} count={data.invoices.length} /><p className="mb-0 mt-[14px] text-micro text-subtle">{t('notLegalInvoice')}</p>
    {data.invoices.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noInvoices')}</p> : <div className="divide-y divide-divider border-t border-border">{data.invoices.map((invoice) => { const due = Math.max(0, invoice.amountMad - invoice.paidMad); return <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-primary [&_small]:text-caption [&_small]:text-subtle" key={invoice.id}><div><div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-subtle"><strong>{invoice.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold ${due === 0 ? 'bg-secondary text-success' : 'bg-accent text-accent-foreground'}`}>{t(due === 0 ? 'paidInFull' : invoice.paidMad > 0 ? 'partiallyPaid' : 'unpaid')}</span></div><h3>{invoice.customer}</h3><small>{invoice.deliveryNumber} · {dateLabel(invoice.issuedAt, locale)}</small></div><div className="grid gap-1 text-caption text-subtle [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-muted-foreground"><span>{t('total')}</span><strong>{formatMad(invoice.amountMad, locale)}</strong></div><div className="grid gap-1 text-caption text-subtle [&_strong]:font-mono [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-muted-foreground"><span>{t('balanceDue')}</span><strong>{formatMad(due, locale)}</strong></div>{due > 0 && <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onRecordPayment(invoice.id, due)}>{t('recordPayment')}</Button>}</article>; })}</div>}
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
  return <div className="grid gap-[14px]"><section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('navReturns')} title={t('requestReturn')} count={data.returns.length} /><p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0"><RotateCcw size={15} />{t('pendingInspection')}</p>
    <form className="grid gap-[11px] rounded-md border border-border bg-surface p-[14px] sm:grid-cols-2 lg:grid-cols-4 grid gap-3 rounded-md border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}><Select value={deliveryId || 'unselected'} onValueChange={(value) => { setDeliveryId(value === 'unselected' ? '' : value); setItemId(''); }}><SelectTrigger aria-label={t('selectDelivery')}><SelectValue placeholder={t('selectDelivery')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectDelivery')}</SelectItem>{deliveredNotes.map((note) => <SelectItem key={note.id} value={note.id}>{note.number} · {note.customer}</SelectItem>)}</SelectContent></Select><Select value={itemId || 'unselected'} onValueChange={(value) => setItemId(value === 'unselected' ? '' : value)} disabled={!selectedDelivery}><SelectTrigger aria-label={t('item')}><SelectValue placeholder={t('item')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('item')}</SelectItem>{selectedDelivery?.lines.map((line) => <SelectItem key={line.itemId} value={line.itemId}>{line.name}</SelectItem>)}</SelectContent></Select><Input type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label={t('quantity')} required /><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('returnReason')} required /><Button variant="primary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" type="submit">{t('requestReturn')}</Button></form>
  </section><section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('inspection')} title={t('navReturns')} count={data.returns.length} />
    {data.returns.length === 0 ? <p className="my-5 grid min-h-[110px] place-items-center text-center text-sm text-subtle">{t('noReturns')}</p> : <div className="divide-y divide-divider border-t border-border">{data.returns.map((record) => <ReturnRecord key={record.id} record={record} data={data} onReceive={onReceiveReturn} onResolve={onResolveReturn} />)}</div>}
  </section></div>;
}

function ReturnRecord({ record, data, onReceive, onResolve }: { record: CustomerReturn; data: WorkspaceData; onReceive: (id: string) => void; onResolve: (id: string, decision: 'release' | 'reject') => void }) {
  const { t, locale } = useLocale();
  return <article className="grid gap-3 py-4 min-[761px]:grid-cols-[minmax(0,1fr)_minmax(180px,1.2fr)_auto] min-[761px]:items-center [&_h3]:m-0 [&_h3]:mt-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-primary [&_small]:text-caption [&_small]:text-subtle"><div><div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-subtle"><strong>{record.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold ${record.status === 'released' ? 'bg-secondary text-success' : record.status === 'rejected' ? 'bg-destructive-soft text-destructive' : 'bg-accent text-accent-foreground'}`}>{t(record.status)}</span></div><h3>{record.customer}</h3><small>{record.deliveryNumber} · {record.reason}</small></div><div className="grid gap-[7px]">{record.lines.map((line) => { const item = data.items.find((candidate) => candidate.id === line.itemId); return <div className="flex items-center justify-between gap-[10px] [&>span]:grid [&>span]:gap-[3px] [&>span]:text-caption [&>span]:text-subtle [&_small]:font-mono [&_small]:text-micro [&_small]:text-subtle [&>strong]:whitespace-nowrap [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-muted-foreground" key={line.itemId}><span>{item?.name}</span><strong>{formatStock(line.quantity, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div>; })}</div><div className="flex justify-end max-[920px]:col-start-2 max-[760px]:col-auto [&>.button]:min-h-[34px] [&>.button]:px-[10px] [&>.button]:text-caption max-[760px]:[&>.button]:w-full">{record.status === 'requested' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onReceive(record.id)}>{t('inspectReturn')}</Button> : record.status === 'inspection' ? <div className="flex flex-wrap gap-2"><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onResolve(record.id, 'release')}>{t('releaseReturn')}</Button><Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onResolve(record.id, 'reject')}>{t('rejectReturn')}</Button></div> : <span className="inline-flex items-center gap-[5px] text-caption font-semibold text-muted-foreground"><Check size={14} />{t(record.status)}</span>}</div></article>;
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
  return <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4"><SectionHeading eyebrow={t('navAccess')} title={t('accessSubtitle')} /><div className="mt-3 rounded-md border border-accent-border bg-destructive-soft p-3 text-caption leading-relaxed text-accent-foreground"><CircleAlert size={16} /><p>{t('accessNote')}</p></div><div className="grid gap-2"><div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(70px,auto))] items-center gap-3 border-b border-divider py-2 text-xs text-muted-foreground grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(70px,auto))] gap-3 border-b border-border pb-2 text-caption font-semibold text-subtle"><span>{t('navigation')}</span>{roles.map((role) => <strong key={role}>{t(ROLE_LABEL_KEYS[role])}</strong>)}</div>{WORKSPACE_PAGES.map((page) => <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(70px,auto))] items-center gap-3 border-b border-divider py-2 text-xs text-muted-foreground" key={page}><span>{t(PAGE_LABEL_KEYS[page])}</span>{roles.map((role) => <Label className="mx-auto" key={`${page}-${role}`}><Checkbox checked={roleAccess[role].includes(page)} disabled={page === 'overview'} onCheckedChange={() => toggle(role, page)} aria-label={`${t(ROLE_LABEL_KEYS[role])}: ${t(PAGE_LABEL_KEYS[page])}`} /><span /></Label>)}</div>)}</div><p className="mb-0 mt-[14px] text-micro text-subtle">{t('accessPreviewOnly')}</p></section>;
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
