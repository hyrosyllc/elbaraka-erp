'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Archive, Check, ChevronDown, CircleAlert, Edit3, Plus, Search, X } from 'lucide-react';
import {
  CatalogItem,
  ITEM_TYPE_LABELS,
  ItemType,
  RecipeComponent,
  SalesOrder,
  StockUnit,
  formatStock,
} from '@/lib/workspace';

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
  if (available <= 0) return 'status-empty';
  if (reorderPoint > 0 && available <= reorderPoint) return 'status-warning';
  return 'status-ready';
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
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="dialog-heading">
          <div><p className="section-kicker">Catalog record</p><h2 id="editor-title">{item ? 'Edit item' : 'Add an item'}</h2></div>
          <button className="icon-button" type="button" aria-label="Close item editor" onClick={onClose}><X size={19} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="editor-body">
            <div className="form-grid">
              <label className="field"><span>Item name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Whole coriander" required maxLength={100} /></label>
              <label className="field"><span>Item code</span><input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="e.g. RM-COR-005" required maxLength={40} /></label>
              <label className="field"><span>Item type</span><span className="select-wrap"><select value={type} onChange={(event) => handleTypeChange(event.target.value as ItemType)}>{Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={16} /></span></label>
              <label className="field"><span>Stock unit</span><span className="unit-readonly">{unit === 'g' ? 'Grams (g)' : 'Each'}</span></label>
              {type === 'finished_good' && <label className="field"><span>Net spice weight</span><span className="input-suffix"><input type="number" min="0.001" step="0.001" value={netWeightG} onChange={(event) => setNetWeightG(event.target.value)} placeholder="50" required /><i>g</i></span></label>}
                            {type === 'finished_good' && <label className="field"><span>Sale price</span><span className="input-suffix"><input type="number" min="0" step="0.01" value={salePriceMad} onChange={(event) => setSalePriceMad(event.target.value)} placeholder="18.00" /><i>MAD</i></span></label>}
              {type === 'blend' && <label className="field"><span>Batch output</span><span className="input-suffix"><input type="number" min="0.001" step="0.001" value={recipeOutputQuantity} onChange={(event) => setRecipeOutputQuantity(event.target.value)} placeholder="1000" required /><i>g</i></span></label>}
              <label className="field"><span>Reorder point <small>({unit})</small></span><input type="number" min="0" step="1" value={reorderPoint} onChange={(event) => setReorderPoint(event.target.value)} placeholder="0" /></label>
            </div>

            {(type === 'blend' || type === 'finished_good') && (
              <div className="formula-editor">
                <div className="formula-heading"><div><strong>{type === 'blend' ? 'Blend formula' : 'Formula & packaging'}</strong><small>{type === 'blend' ? `Component quantities for ${recipeOutputQuantity || '...'} g output` : 'Component quantities per finished item'}</small></div><button className="small-action" type="button" onClick={() => setComponents((current) => [...current, { itemId: '', quantity: 0 }])}><Plus size={15} /> Add component</button></div>
                {components.length === 0 && <p className="formula-empty">Add the spices or packaging used to make this item.</p>}
                <div className="formula-lines">
                  {components.map((component, index) => {
                    const selected = items.find((candidate) => candidate.id === component.itemId);
                    return (
                      <div className="formula-line" key={`${item?.id ?? 'new'}-${index}`}>
                        <span className="select-wrap"><select aria-label={`Component ${index + 1}`} value={component.itemId} onChange={(event) => updateComponent(index, { itemId: event.target.value })} required><option value="">Choose an item</option>{selectableComponents.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku}</option>)}</select><ChevronDown size={15} /></span>
                        <span className="input-suffix"><input aria-label={`Quantity for component ${index + 1}`} type="number" min="0.001" step="0.001" value={component.quantity || ''} onChange={(event) => updateComponent(index, { quantity: Number(event.target.value) })} placeholder="0" required /><i>{selected?.baseUnit ?? (type === 'blend' ? 'g' : 'unit')}</i></span>
                        <button className="icon-button remove-component" type="button" aria-label={`Remove component ${index + 1}`} onClick={() => setComponents((current) => current.filter((_, position) => position !== index))}><X size={16} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="check-field"><input type="checkbox" checked={trackLots} onChange={(event) => setTrackLots(event.target.checked)} /><span className="check-visual"><Check size={13} /></span><span><strong>Track batches and expiry</strong><small>Useful for spices and finished production lots.</small></span></label>
            {!item && <p className="stock-hint"><CircleAlert size={15} /> New items start with zero stock. Record receipts or opening balances through inventory movements.</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Check size={16} /> {item ? 'Save changes' : 'Add item'}</button></div>
        </form>
      </section>
    </div>
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
      <section className="catalog-tools surface">
        <div className="catalog-filter-row" role="tablist" aria-label="Filter items by type">
          {filters.map((itemFilter) => (
            <button key={itemFilter.id} className={`filter-tab ${filter === itemFilter.id ? 'filter-tab-active' : ''}`} role="tab" aria-selected={filter === itemFilter.id} onClick={() => setFilter(itemFilter.id)}>
              {itemFilter.label}<span>{counts[itemFilter.id]}</span>
            </button>
          ))}
        </div>
        <div className="catalog-controls">
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item name or code" aria-label="Search item name or code" /></label>
          <label className="inactive-toggle"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /><span>Include inactive</span></label>
          <button className="button button-primary add-item-button" onClick={() => { setEditing(null); setAdding(true); }}><Plus size={17} /> Add item</button>
        </div>
      </section>

      <section className="catalog-table-surface surface">
        <div className="table-context"><div><strong>{filter === 'all' ? 'All catalog items' : filters.find((entry) => entry.id === filter)?.label}</strong><span>{visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'} shown</span></div><span className="unit-key"><i>g</i> grams <i>ea</i> each</span></div>
        <div className="desktop-table-wrap">
          <table className="catalog-table">
            <thead><tr><th>Item</th><th>Type</th><th>On hand</th><th>Available</th><th>Reorder at</th><th>Batch tracking</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {visibleItems.map((item) => {
                const reserved = reservedForItem(orders, item.id);
                const available = item.stockOnHand - reserved;
                const needsReorder = item.reorderPoint > 0 && available <= item.reorderPoint;
                return (
                  <tr key={item.id} className={!item.active ? 'row-inactive' : ''}>
                    <td><div className="item-cell"><span className={`item-mark type-${item.type}`} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.sku}{item.netWeightG ? ` · ${item.netWeightG} g net` : ''}</small></span></div></td>
                    <td><span className={`type-label type-label-${item.type}`}>{ITEM_TYPE_LABELS[item.type]}</span></td>
                    <td><span className="stock-value">{formatStock(item.stockOnHand, item.baseUnit)}</span></td>
                    <td><span className="stock-value">{formatStock(available, item.baseUnit)}</span>{reserved > 0 && <small className="reserved-hint">{formatStock(reserved, item.baseUnit)} reserved</small>}</td>
                    <td>{item.reorderPoint > 0 ? <span className={needsReorder ? 'reorder-value' : ''}>{formatStock(item.reorderPoint, item.baseUnit)}</span> : <span className="muted-dash">Not set</span>}</td>
                    <td><span className={`tracking-status ${item.trackLots ? 'tracking-on' : ''}`}><span />{item.trackLots ? 'Tracked' : 'Not tracked'}</span></td>
                    <td><div className="row-actions"><button className="icon-button" type="button" aria-label={`Edit ${item.name}`} onClick={() => openEditor(item)}><Edit3 size={16} /></button><button className="icon-button" type="button" aria-label={`${item.active ? 'Deactivate' : 'Reactivate'} ${item.name}`} title={item.active ? 'Deactivate item' : 'Reactivate item'} onClick={() => onSetActive(item.id, !item.active)}>{item.active ? <Archive size={16} /> : <Check size={16} />}</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mobile-item-list">
          {visibleItems.map((item) => {
            const available = item.stockOnHand - reservedForItem(orders, item.id);
            return (
              <article className={`mobile-item-card ${!item.active ? 'row-inactive' : ''}`} key={item.id}>
                <div className="mobile-item-head"><span className={`item-mark type-${item.type}`} aria-hidden="true" /><div className="mobile-item-title"><strong>{item.name}</strong><small>{item.sku}</small></div><button className="icon-button" aria-label={`Edit ${item.name}`} onClick={() => openEditor(item)}><Edit3 size={16} /></button></div>
                <div className="mobile-item-meta"><span className={`type-label type-label-${item.type}`}>{ITEM_TYPE_LABELS[item.type]}</span><span className={`status ${stockTone(available, item.reorderPoint)}`}>{formatStock(available, item.baseUnit)} available</span></div>
                <div className="mobile-item-bottom"><span>On hand <strong>{formatStock(item.stockOnHand, item.baseUnit)}</strong></span><span>{item.trackLots ? 'Batch tracked' : 'No batch tracking'}</span></div>
              </article>
            );
          })}
        </div>
        {visibleItems.length === 0 && <div className="empty-state"><div className="empty-state-icon"><Search size={21} /></div><strong>No items match this view</strong><p>Try another item type or clear the search.</p></div>}
        <div className="table-footer"><span>Catalog changes preserve item history. Deactivate items that should no longer be ordered.</span><span>{items.filter((item) => item.active).length} active / {items.length} total</span></div>
      </section>

      {adding && <ItemEditor key="new-item" items={items} item={null} onClose={() => setAdding(false)} onSave={onSave} />}
      {editing && <ItemEditor key={editing.id} items={items} item={editing} onClose={() => setEditing(null)} onSave={onSave} />}
    </>
  );
}