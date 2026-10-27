'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { FormEvent, useMemo, useState } from 'react';
import { Archive, Check, CircleAlert, Edit3, Plus, Search, X } from 'lucide-react';
import {
  CatalogItem,
  ITEM_TYPE_LABELS,
  ItemType,
  RecipeComponent,
  SalesOrder,
  StockUnit,
  formatStock,
} from '@/lib/workspace';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type CatalogFilter = 'all' | ItemType;
type CatalogWorkspaceProps = {
  items: CatalogItem[];
  orders: SalesOrder[];
  onSave: (item: CatalogItem) => void;
  onSetActive: (itemId: string, active: boolean) => void;
};

const filters: { id: CatalogFilter; label: string }[] = [
  { id: 'all', label: 'All items' },
  { id: 'raw_material', label: 'Raw materials' },
  { id: 'blend', label: 'Blends' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'finished_good', label: 'Finished goods' },
];

function reservedForItem(orders: SalesOrder[], itemId: string) {
  return orders
    .filter((order) => order.status === 'confirmed')
    .flatMap((order) => order.lines)
    .filter((line) => line.itemId === itemId)
    .reduce((total, line) => total + line.quantity, 0);
}

function stockTone(available: number, reorderPoint: number) {
  if (available <= 0) return 'bg-destructive-soft text-destructive';
  if (reorderPoint > 0 && available <= reorderPoint) return 'bg-accent text-accent-foreground';
  return 'bg-secondary text-success';
}

function itemMarkerClass(type: ItemType) {
  switch (type) {
    case 'raw_material': return 'bg-muted-foreground';
    case 'blend': return 'bg-saffron';
    case 'packaging': return 'bg-subtle';
    case 'finished_good': return 'bg-destructive';
  }
}

function itemLabelClass(type: ItemType) {
  switch (type) {
    case 'raw_material': return 'bg-muted text-muted-foreground';
    case 'blend': return 'bg-accent text-accent-foreground';
    case 'packaging': return 'bg-background text-subtle';
    case 'finished_good': return 'bg-destructive-soft text-destructive';
  }
}

function ItemEditor({
  items,
  item,
  onClose,
  onSave,
}: {
  items: CatalogItem[];
  item: CatalogItem | null;
  onClose: () => void;
  onSave: (item: CatalogItem) => void;
}) {
  const [sku, setSku] = useState(item?.sku ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [type, setType] = useState<ItemType>(item?.type ?? 'raw_material');
  const [netWeightG, setNetWeightG] = useState(item?.netWeightG ? String(item.netWeightG) : '');
  const [salePriceMad, setSalePriceMad] = useState(item?.salePriceMad ? String(item.salePriceMad) : '');
  const [recipeOutputQuantity, setRecipeOutputQuantity] = useState(item?.type === 'blend' && item.recipeOutputQuantity ? String(item.recipeOutputQuantity) : '');
  const [reorderPoint, setReorderPoint] = useState(item?.reorderPoint ? String(item.reorderPoint) : '');
  const [trackLots, setTrackLots] = useState(item?.trackLots ?? true);
  const [components, setComponents] = useState<RecipeComponent[]>(item?.components ?? []);
  const [error, setError] = useState('');
  const unit: StockUnit = type === 'raw_material' || type === 'blend' ? 'g' : 'each';
  const selectableComponents = items.filter((candidate) => {
    if (!candidate.active || candidate.id === item?.id) return false;
    if (type === 'blend') return candidate.type === 'raw_material' || candidate.type === 'blend';
    if (type === 'finished_good') return ['raw_material', 'blend', 'packaging'].includes(candidate.type);
    return false;
  });

  const updateComponent = (index: number, changes: Partial<RecipeComponent>) => {
    setComponents((current) => current.map((component, position) => position === index ? { ...component, ...changes } : component));
  };

  const handleTypeChange = (nextType: ItemType) => {
    setType(nextType);
    if (nextType !== 'blend' && nextType !== 'finished_good') setComponents([]);
    if (nextType !== 'finished_good') setNetWeightG('');
    if (nextType !== 'finished_good') setSalePriceMad('');
    if (nextType !== 'blend') setRecipeOutputQuantity('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedSku = sku.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(normalizedSku)) {
      setError('Use 2 to 40 letters, numbers, or hyphens for the item code.');
      return;
    }
    if (items.some((candidate) => candidate.sku.toUpperCase() === normalizedSku && candidate.id !== item?.id)) {
      setError('That item code is already in use.');
      return;
    }
    if (type === 'finished_good' && Number(netWeightG) <= 0) {
      setError('Enter the net spice weight in grams for this finished good.');
      return;
    }
    if (type === 'blend' && Number(recipeOutputQuantity) <= 0) {
      setError('Enter the planned output quantity in grams for one blend batch.');
      return;
    }
    if ((type === 'blend' || type === 'finished_good') && components.length === 0) {
      setError('Add at least one component to this formula.');
      return;
    }
    if (components.some((component) => !component.itemId || component.quantity <= 0 || !Number.isFinite(component.quantity))) {
      setError('Each formula component needs a catalog item and a quantity greater than zero.');
      return;
    }

    onSave({
      id: item?.id ?? `item-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
      sku: normalizedSku,
      name: name.trim(),
      type,
      baseUnit: unit,
      stockOnHand: item?.stockOnHand ?? 0,
        quarantinedStock: item?.quarantinedStock ?? 0,
      reorderPoint: Math.max(0, Number(reorderPoint) || 0),
      netWeightG: type === 'finished_good' ? Number(netWeightG) : null,
      recipeOutputQuantity: type === 'blend' ? Number(recipeOutputQuantity) : type === 'finished_good' ? 1 : null,
        salePriceMad: type === 'finished_good' ? Math.max(0, Number(salePriceMad) || 0) : 0,
      trackLots,
      active: item?.active ?? true,
      components,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[min(90vh,850px)] w-full max-w-[590px] overflow-y-auto rounded-[10px] border border-white/70 bg-white shadow-xl max-[520px]:max-h-[92dvh] max-[520px]:max-w-none max-[520px]:rounded-t-xl max-[520px]:rounded-b-none" showCloseButton={false}>
        <DialogHeader className="flex items-center justify-between border-b border-border px-[22px] pb-4 pt-5 max-[520px]:px-4 max-[520px]:pb-[13px] max-[520px]:pt-4 [&_h2]:mt-[3px] [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:tracking-[-.3px] [&_h2]:text-foreground flex-row items-center justify-between">
          <div><p className="m-0 text-caption font-bold tracking-[.35px] text-subtle">Catalog record</p><DialogTitle id="editor-title">{item ? 'Edit item' : 'Add an item'}</DialogTitle><DialogDescription className="sr-only">Edit the item details and its stock formula.</DialogDescription></div>
          <Button variant="ghost" size="icon" className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-subtle transition-colors hover:border-border hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50" type="button" aria-label="Close item editor" onClick={onClose}><X size={19} /></Button>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="grid gap-[18px] px-[22px] py-5 max-[520px]:gap-[15px] max-[520px]:p-4">
            <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-2 min-[521px]:gap-[15px]">
              <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>Item name</span><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Whole coriander" required maxLength={100} /></Label>
              <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>Item code</span><Input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="e.g. RM-COR-005" required maxLength={40} /></Label>
              <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>Item type</span><Select value={type} onValueChange={(value) => handleTypeChange(value as ItemType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Label>
              <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>Stock unit</span><span className="flex h-[37px] items-center rounded-[5px] border border-border bg-muted px-[10px] font-mono text-caption text-muted-foreground">{unit === 'g' ? 'Grams (g)' : 'Each'}</span></Label>
              {type === 'finished_good' && <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>Net spice weight</span><span className="relative block [&>input]:pr-[45px] [&>i]:absolute [&>i]:right-[11px] [&>i]:top-1/2 [&>i]:-translate-y-1/2 [&>i]:font-mono [&>i]:text-caption [&>i]:not-italic [&>i]:text-subtle"><Input type="number" min="0.001" step="0.001" value={netWeightG} onChange={(event) => setNetWeightG(event.target.value)} placeholder="50" required /><i>g</i></span></Label>}
              {type === 'finished_good' && <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>Sale price</span><span className="relative block [&>input]:pr-[45px] [&>i]:absolute [&>i]:right-[11px] [&>i]:top-1/2 [&>i]:-translate-y-1/2 [&>i]:font-mono [&>i]:text-caption [&>i]:not-italic [&>i]:text-subtle"><Input type="number" min="0" step="0.01" value={salePriceMad} onChange={(event) => setSalePriceMad(event.target.value)} placeholder="18.00" /><i>MAD</i></span></Label>}
              {type === 'blend' && <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>Batch output</span><span className="relative block [&>input]:pr-[45px] [&>i]:absolute [&>i]:right-[11px] [&>i]:top-1/2 [&>i]:-translate-y-1/2 [&>i]:font-mono [&>i]:text-caption [&>i]:not-italic [&>i]:text-subtle"><Input type="number" min="0.001" step="0.001" value={recipeOutputQuantity} onChange={(event) => setRecipeOutputQuantity(event.target.value)} placeholder="1000" required /><i>g</i></span></Label>}
              <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>Reorder point <small>({unit})</small></span><Input type="number" min="0" step="1" value={reorderPoint} onChange={(event) => setReorderPoint(event.target.value)} placeholder="0" /></Label>
            </div>

            {(type === 'blend' || type === 'finished_good') && (
              <div className="rounded-[7px] border border-divider bg-surface p-[13px] max-[520px]:p-[10px]">
                <div className="flex items-center justify-between gap-[10px] max-[520px]:items-start [&>div]:grid [&>div]:gap-1 [&_strong]:text-label [&_strong]:text-muted-foreground [&_small]:text-micro [&_small]:text-subtle"><div><strong>{type === 'blend' ? 'Blend formula' : 'Formula & packaging'}</strong><small>{type === 'blend' ? `Component quantities for ${recipeOutputQuantity || '...'} g output` : 'Component quantities per finished item'}</small></div><Button className="inline-flex min-h-[29px] items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-border bg-white px-2 text-micro font-bold text-primary hover:bg-background max-[520px]:px-[6px] max-[520px]:text-micro" type="button" onClick={() => setComponents((current) => [...current, { itemId: '', quantity: 0 }])}><Plus size={15} /> Add component</Button></div>
                {components.length === 0 && <p className="my-[15px] mb-0.5 text-caption text-subtle">Add the spices or packaging used to make this item.</p>}
                <div className="mt-3 grid gap-2">
                  {components.map((component, index) => {
                    const selected = items.find((candidate) => candidate.id === component.itemId);
                    return (
                      <div className="grid grid-cols-[minmax(0,1fr)_105px_31px] items-center gap-[7px] max-[520px]:grid-cols-[minmax(0,1fr)_80px_30px] max-[520px]:gap-[5px] [&_select]:h-[34px] [&_select]:text-caption [&_input]:h-[34px] [&_input]:text-caption" key={`${item?.id ?? 'new'}-${index}`}>
                        <Select value={component.itemId || 'unselected'} onValueChange={(value) => updateComponent(index, { itemId: value === 'unselected' ? '' : value })}><SelectTrigger aria-label={`Component ${index + 1}`}><SelectValue placeholder="Choose an item" /></SelectTrigger><SelectContent><SelectItem value="unselected">Choose an item</SelectItem>{selectableComponents.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku}</SelectItem>)}</SelectContent></Select>
                        <span className="relative block [&>input]:pr-[45px] [&>i]:absolute [&>i]:right-[11px] [&>i]:top-1/2 [&>i]:-translate-y-1/2 [&>i]:font-mono [&>i]:text-caption [&>i]:not-italic [&>i]:text-subtle"><Input aria-label={`Quantity for component ${index + 1}`} type="number" min="0.001" step="0.001" value={component.quantity || ''} onChange={(event) => updateComponent(index, { quantity: Number(event.target.value) })} placeholder="0" required /><i>{selected?.baseUnit ?? (type === 'blend' ? 'g' : 'unit')}</i></span>
                        <Button className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-subtle transition-colors hover:border-border hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50 size-[30px]" type="button" aria-label={`Remove component ${index + 1}`} onClick={() => setComponents((current) => current.filter((_, position) => position !== index))}><X size={16} /></Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Label className="flex cursor-pointer items-start gap-[9px] [&>span:last-child]:grid [&>span:last-child]:gap-1 [&_strong]:text-caption [&_strong]:text-muted-foreground [&_small]:text-micro [&_small]:text-subtle"><Checkbox className="mt-px size-[17px]" checked={trackLots} onCheckedChange={(checked) => setTrackLots(checked === true)} /><span><strong>Track batches and expiry</strong><small>Useful for spices and finished production lots.</small></span></Label>
            {!item && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0"><CircleAlert size={15} /> New items start with zero stock. Record receipts or opening balances through inventory movements.</p>}
            {error && <p className="m-0 rounded-[5px] bg-destructive-soft px-[10px] py-[9px] text-caption text-destructive" role="alert">{error}</p>}
          </DialogBody>
          <DialogFooter className="flex justify-end gap-2 border-t border-border bg-surface px-[22px] py-[14px] max-[520px]:px-4 max-[520px]:py-3 max-[520px]:pb-[max(12px,env(safe-area-inset-bottom))]"><Button variant="secondary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-white text-muted-foreground hover:border-strong hover:bg-surface" type="button" onClick={onClose}>Cancel</Button><Button variant="primary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-primary text-white hover:bg-primary-deep" type="submit"><Check size={16} /> {item ? 'Save changes' : 'Add item'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogWorkspace({ items, orders, onSave, onSetActive }: CatalogWorkspaceProps) {
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => ({
    all: items.filter((item) => showInactive || item.active).length,
    raw_material: items.filter((item) => item.type === 'raw_material' && (showInactive || item.active)).length,
    blend: items.filter((item) => item.type === 'blend' && (showInactive || item.active)).length,
    packaging: items.filter((item) => item.type === 'packaging' && (showInactive || item.active)).length,
    finished_good: items.filter((item) => item.type === 'finished_good' && (showInactive || item.active)).length,
  }), [items, showInactive]);

  const visibleItems = items.filter((item) => {
    const matchesType = filter === 'all' || item.type === filter;
    const matchesStatus = showInactive || item.active;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term);
    return matchesType && matchesStatus && matchesSearch;
  });

  const openEditor = (item: CatalogItem) => {
    setAdding(false);
    setEditing(item);
  };

  return (
    <>
      <section className="mb-[14px] overflow-hidden rounded-[9px] border border-border bg-card">
        <div className="flex min-h-[49px] items-stretch gap-5 overflow-x-auto border-b border-border px-[18px] [scrollbar-width:thin] max-[760px]:min-h-[46px] max-[760px]:gap-4 max-[760px]:px-[13px]" role="tablist" aria-label="Filter items by type">
          {filters.map((itemFilter) => (
            <Button key={itemFilter.id} className={`relative flex shrink-0 items-center gap-[7px] border-0 bg-transparent px-px text-label font-semibold text-subtle after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent hover:bg-transparent hover:text-primary [&>span]:grid [&>span]:h-[18px] [&>span]:min-w-[18px] [&>span]:place-items-center [&>span]:rounded-[5px] [&>span]:bg-muted [&>span]:px-1 [&>span]:font-mono [&>span]:text-micro [&>span]:text-subtle ${filter === itemFilter.id ? 'text-primary-deep after:bg-primary [&>span]:bg-secondary [&>span]:text-primary' : ''}`} role="tab" aria-selected={filter === itemFilter.id} onClick={() => setFilter(itemFilter.id)}>
              {itemFilter.label}<span>{counts[itemFilter.id]}</span>
            </Button>
          ))}
        </div>
        <div className="flex min-h-[61px] items-center gap-4 px-[18px] py-[10px] max-[760px]:flex-wrap max-[760px]:gap-x-[11px] max-[760px]:gap-y-[9px] max-[760px]:px-[13px] max-[760px]:py-[11px]">
          <Label className="flex min-h-[35px] w-full max-w-[300px] items-center gap-2 rounded-md border border-border bg-card px-[10px] text-subtle focus-within:border-subtle max-[760px]:order-1 max-[760px]:max-w-none [&>input]:h-auto [&>input]:border-0 [&>input]:bg-transparent [&>input]:p-0 [&>input]:text-label [&>input]:text-foreground [&>input]:focus-visible:ring-0"><Search size={17} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item name or code" aria-label="Search item name or code" /></Label>
          <Label className="order-2 flex cursor-pointer items-center gap-[7px] whitespace-nowrap text-caption text-subtle max-[520px]:text-micro"><Checkbox checked={showInactive} onCheckedChange={(checked) => setShowInactive(checked === true)} /><span>Include inactive</span></Label>
          <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-primary text-white hover:bg-primary-deep order-3 ml-auto min-h-[35px] px-3 text-label" onClick={() => { setEditing(null); setAdding(true); }}><Plus size={17} /> Add item</Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[9px] border border-border bg-card">
        <div className="flex min-h-[58px] items-center justify-between gap-[14px] border-b border-border px-[18px] py-[11px] max-[760px]:min-h-[51px] max-[760px]:px-[13px] max-[760px]:py-[9px] max-[520px]:[&>div]:flex-col max-[520px]:[&>div]:items-start max-[520px]:[&>div]:gap-[3px] [&>div]:flex [&>div]:items-baseline [&>div]:gap-[10px] [&_strong]:text-xs [&_strong]:font-bold [&_strong]:text-muted-foreground [&_span]:text-caption [&_span]:text-subtle"><div><strong>{filter === 'all' ? 'All catalog items' : filters.find((entry) => entry.id === filter)?.label}</strong><span>{visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'} shown</span></div><span className="flex items-center gap-[6px] text-caption text-subtle max-[760px]:text-[0px] [&_i]:inline-grid [&_i]:h-[19px] [&_i]:min-w-5 [&_i]:place-items-center [&_i]:rounded [&_i]:bg-background [&_i]:px-1 [&_i]:font-mono [&_i]:text-micro [&_i]:not-italic [&_i]:text-muted-foreground"><i>g</i> grams <i>ea</i> each</span></div>
        <div className="overflow-x-auto max-[760px]:hidden">
          <Table className="w-full min-w-[850px] border-collapse text-left whitespace-nowrap [&_th]:h-[38px] [&_th]:border-b [&_th]:border-divider [&_th]:bg-surface [&_th]:px-[11px] [&_th]:text-micro [&_th]:font-bold [&_th]:text-subtle [&_td]:h-[61px] [&_td]:border-b [&_td]:border-divider [&_td]:px-[11px] [&_td]:py-[7px] [&_td]:text-caption [&_td]:text-subtle [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover_td]:bg-card [&_th:first-child]:pl-[18px] [&_td:first-child]:pl-[18px]">
            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Type</TableHead><TableHead>On hand</TableHead><TableHead>Available</TableHead><TableHead>Reorder at</TableHead><TableHead>Batch tracking</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {visibleItems.map((item) => {
                const reserved = reservedForItem(orders, item.id);
                const available = item.stockOnHand - reserved;
                const needsReorder = item.reorderPoint > 0 && available <= item.reorderPoint;
                return (
                  <TableRow key={item.id} className={!item.active ? 'opacity-55' : ''}>
                    <TableCell><div className="flex min-w-[205px] items-center gap-[10px] [&>span:last-child]:grid [&>span:last-child]:min-w-0 [&>span:last-child]:gap-1 [&_strong]:overflow-hidden [&_strong]:text-xs [&_strong]:font-semibold [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-primary [&_small]:font-mono [&_small]:text-caption [&_small]:text-subtle"><span className={`block h-[27px] w-[6px] shrink-0 rounded-[3px] ${itemMarkerClass(item.type)}`} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.sku}{item.netWeightG ? ` · ${item.netWeightG} g net` : ''}</small></span></div></TableCell>
                    <TableCell><span className={`inline-flex min-h-[21px] items-center rounded px-[7px] text-micro font-semibold ${itemLabelClass(item.type)}`}>{ITEM_TYPE_LABELS[item.type]}</span></TableCell>
                    <TableCell><span className="font-mono text-caption text-muted-foreground">{formatStock(item.stockOnHand, item.baseUnit)}</span></TableCell>
                    <TableCell><span className="font-mono text-caption text-muted-foreground">{formatStock(available, item.baseUnit)}</span>{reserved > 0 && <small className="mt-[3px] block text-micro text-accent-foreground">{formatStock(reserved, item.baseUnit)} reserved</small>}</TableCell>
                    <TableCell>{item.reorderPoint > 0 ? <span className={needsReorder ? 'font-mono text-caption text-destructive' : ''}>{formatStock(item.reorderPoint, item.baseUnit)}</span> : <span className="text-caption text-subtle">Not set</span>}</TableCell>
                    <TableCell><span className={`inline-flex items-center gap-[6px] text-micro text-subtle [&>span]:size-[6px] [&>span]:rounded-full [&>span]:bg-strong ${item.trackLots ? 'text-muted-foreground [&>span]:bg-subtle' : ''}`}><span />{item.trackLots ? 'Tracked' : 'Not tracked'}</span></TableCell>
                    <TableCell><div className="flex justify-end gap-[3px]"><Button className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-subtle transition-colors hover:border-border hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50" type="button" aria-label={`Edit ${item.name}`} onClick={() => openEditor(item)}><Edit3 size={16} /></Button><Button className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-subtle transition-colors hover:border-border hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50" type="button" aria-label={`${item.active ? 'Deactivate' : 'Reactivate'} ${item.name}`} title={item.active ? 'Deactivate item' : 'Reactivate item'} onClick={() => onSetActive(item.id, !item.active)}>{item.active ? <Archive size={16} /> : <Check size={16} />}</Button></div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="hidden max-[760px]:grid">
          {visibleItems.map((item) => {
            const available = item.stockOnHand - reservedForItem(orders, item.id);
            return (
              <article className={`grid gap-3 border-b border-divider px-[13px] py-[14px] ${!item.active ? 'opacity-55' : ''}`} key={item.id}>
                <div className="grid grid-cols-[6px_minmax(0,1fr)_32px] items-center gap-[10px]"><span className={`block h-[31px] w-2 shrink-0 rounded-[3px] ${itemMarkerClass(item.type)}`} aria-hidden="true" /><div className="grid min-w-0 gap-1 [&_strong]:overflow-hidden [&_strong]:text-xs [&_strong]:font-semibold [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-primary [&_small]:font-mono [&_small]:text-caption [&_small]:text-subtle"><strong>{item.name}</strong><small>{item.sku}</small></div><Button className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-subtle transition-colors hover:border-border hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50" aria-label={`Edit ${item.name}`} onClick={() => openEditor(item)}><Edit3 size={16} /></Button></div>
                <div className="flex items-center justify-between gap-2"><span className={`inline-flex min-h-[21px] items-center rounded px-[7px] text-micro font-semibold type-label-${item.type}`}>{ITEM_TYPE_LABELS[item.type]}</span><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold ${stockTone(available, item.reorderPoint)}`}>{formatStock(available, item.baseUnit)} available</span></div>
                <div className="flex items-center justify-between gap-2 text-micro text-subtle [&_strong]:ml-1 [&_strong]:font-mono [&_strong]:text-micro [&_strong]:font-medium [&_strong]:text-muted-foreground"><span>On hand <strong>{formatStock(item.stockOnHand, item.baseUnit)}</strong></span><span>{item.trackLots ? 'Batch tracked' : 'No batch tracking'}</span></div>
              </article>
            );
          })}
        </div>
        {visibleItems.length === 0 && <div className="grid min-h-[220px] content-center justify-items-center gap-[9px] p-[25px] text-center"><div className="mb-1 grid size-[42px] place-items-center rounded-[10px] bg-muted text-subtle"><Search size={21} /></div><strong>No items match this view</strong><p>Try another item type or clear the search.</p></div>}
        <div className="flex min-h-10 items-center justify-between gap-2 border-t border-border bg-surface px-[18px] py-2 text-micro text-subtle max-[920px]:items-start max-[760px]:px-[13px] max-[760px]:py-[9px] max-[760px]:text-micro max-[520px]:flex-col max-[520px]:gap-[5px] [&>span:last-child]:whitespace-nowrap [&>span:last-child]:font-mono [&>span:last-child]:text-subtle max-[520px]:[&>span:last-child]:self-end"><span>Catalog changes preserve item history. Deactivate items that should no longer be ordered.</span><span>{items.filter((item) => item.active).length} active / {items.length} total</span></div>
      </section>

      {adding && <ItemEditor key="new-item" items={items} item={null} onClose={() => setAdding(false)} onSave={onSave} />}
      {editing && <ItemEditor key={editing.id} items={items} item={editing} onClose={() => setEditing(null)} onSave={onSave} />}
    </>
  );
}