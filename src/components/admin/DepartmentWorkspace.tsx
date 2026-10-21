'use client';

import { FormEvent, useState } from 'react';
import { Check, CircleAlert, ClipboardList, PackageCheck, Plus, ReceiptText, RotateCcw } from 'lucide-react';
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
import { PAGE_LABEL_KEYS, ROLE_LABEL_KEYS } from '@/lib/i18n';

function dateLabel(iso: string, locale: 'en' | 'ar') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'en-MA', { dateStyle: 'medium' }).format(new Date(iso));
}

function SectionHeading({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) {
  return <div className="section-heading"><div><p className="section-kicker">{eyebrow}</p><h2>{title}</h2></div>{count !== undefined && <span className="status status-neutral">{count}</span>}</div>;
}

function InventoryDepartment({ data }: { data: WorkspaceData }) {
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

function SupplierForm({ suppliers, onSave }: { suppliers: Supplier[]; onSave: (supplier: Supplier) => void }) {
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
  return <div className="supplier-manager"><div className="department-inline-heading"><div><strong>{t('suppliers')}</strong><small>{suppliers.length} {t('activeSuppliers')}</small></div><button className="small-action" onClick={() => setOpen(!open)}><Plus size={14} />{t('addSupplier')}</button></div>
    {open && <form className="quick-form quick-form-inline" onSubmit={submit}><input aria-label={t('supplierName')} placeholder={t('supplierName')} value={name} onChange={(event) => setName(event.target.value)} required /><input aria-label={t('contact')} placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} /><input aria-label={t('phone')} placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} /><button className="button button-primary" type="submit">{t('saveChanges')}</button></form>}
  </div>;
}

function PurchasingDepartment({ data, onCreatePurchase, onPurchaseOrdered, onReceivePurchase, onAddSupplier }: {
  data: WorkspaceData;
  onCreatePurchase: (supplierId: string, lines: PurchaseOrderLine[]) => void;
  onPurchaseOrdered: (purchaseId: string) => void;
  onReceivePurchase: (purchaseId: string) => void;
  onAddSupplier: (supplier: Supplier) => void;
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

  const createDraft = () => {
    if (!supplierId || needs.length === 0) return;
    onCreatePurchase(supplierId, needs.map((need) => ({ itemId: need.item.id, quantity: need.quantity, receivedQuantity: 0, unitCostMad: need.item.baseUnit === 'g' ? 0.08 : 0.4 })));
  };

  return <div className="department-stack">
    <section className="operations-summary surface"><div className="summary-icon summary-icon-gold"><CircleAlert size={18} /></div><div><strong>{needs.length}</strong><span>{t('itemsToBuy')}</span></div><div className="summary-divider" /><div className="summary-icon summary-icon-green"><ClipboardList size={18} /></div><div><strong>{productionNeeds.length}</strong><span>{t('materialNeeds')}</span></div><div className="delivery-summary-note">{t('purchaseHint')}</div></section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('needsAttention')} title={t('stockToBuy')} count={needs.length} />
      {needs.length === 0 ? <p className="department-empty">{t('noNeedToBuy')}</p> : <><div className="department-table-wrap"><table className="department-table"><thead><tr><th>{t('item')}</th><th>{t('available')}</th><th>{t('reorderAt')}</th><th>{t('openPurchaseQty')}</th><th>{t('suggestedQty')}</th><th>{t('reason')}</th></tr></thead><tbody>{needs.map((need) => <tr key={need.item.id}><td><strong>{need.item.name}</strong><small>{need.item.sku}</small></td><td className={need.item.stockOnHand <= need.item.reorderPoint ? 'department-low' : ''}>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(need.item.reorderPoint, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(data.purchaseOrders.flatMap((po) => po.lines).filter((line) => line.itemId === need.item.id).reduce((sum, line) => sum + Math.max(0, line.quantity - line.receivedQuantity), 0), need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td><strong>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></td><td>{need.reasons.map((reason) => t(reason === 'production' ? 'productionReason' : 'reorder')).join(' + ')}</td></tr>)}</tbody></table></div>
        <div className="purchase-draft-controls"><label className="field"><span>{t('supplier')}</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>{data.suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.leadTimeDays} {t('days')}</option>)}</select></label><div className="purchase-estimate"><small>{t('estimatedSpend')}</small><strong>{formatMad(estimatedSpend, locale)}</strong></div><button className="button button-primary" onClick={createDraft} disabled={!supplierId}><Plus size={16} />{t('createPurchaseDraft')}</button></div>
      </>}
    </section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('supplierOrders')} title={t('purchaseOrders')} count={data.purchaseOrders.length} />
      {data.purchaseOrders.length === 0 ? <p className="department-empty">{t('noPurchaseOrders')}</p> : <div className="department-record-list">{data.purchaseOrders.map((purchase) => <article className="department-record" key={purchase.id}><div><div className="operation-record-title"><strong>{purchase.number}</strong><span className={`status ${purchase.status === 'received' ? 'status-ready' : purchase.status === 'draft' ? 'status-neutral' : 'status-warning'}`}>{t(purchase.status === 'part_received' ? 'partReceived' : purchase.status)}</span></div><h3>{purchase.supplierName}</h3><small>{dateLabel(purchase.createdAt, locale)} · {purchase.lines.length} {t('lines')}</small></div><div className="department-record-lines">{purchase.lines.map((line) => { const item = data.items.find((entry) => entry.id === line.itemId); return <div className="operation-line" key={line.itemId}><span>{item?.name}<small>{formatStock(line.receivedQuantity, item?.baseUnit ?? 'g', locale === 'ar' ? 'ar-MA' : 'en-MA')} / {formatStock(line.quantity, item?.baseUnit ?? 'g', locale === 'ar' ? 'ar-MA' : 'en-MA')}</small></span><strong>{formatMad(line.quantity * line.unitCostMad, locale)}</strong></div>; })}</div><div className="operation-record-action">{purchase.status === 'draft' ? <button className="button button-secondary" onClick={() => onPurchaseOrdered(purchase.id)}>{t('sendPurchase')}</button> : purchase.status !== 'received' ? <button className="button button-secondary" onClick={() => onReceivePurchase(purchase.id)}><PackageCheck size={15} />{t('markReceived')}</button> : <span className="done-indicator"><Check size={15} />{t('received')}</span>}</div></article>)}</div>}
    </section>
    <section className="surface operations-surface"><SupplierForm suppliers={data.suppliers} onSave={onAddSupplier} /></section>
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
      {needs.length === 0 ? <p className="department-empty">{t('noProductionNeed')}</p> : <div className="department-record-list">{needs.map((need) => <article className="department-record" key={need.item.id}><div><strong>{need.item.name}</strong><small>{need.item.sku} · {t('reorderAt')} {formatStock(need.item.reorderPoint, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</small></div><div className="production-target"><span>{t('available')}</span><strong>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><div className="production-target"><span>{t('quantity')}</span><strong>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><button className="button button-primary" onClick={() => onCreateProduction(need.item.id, need.quantity)}>{t('createWorkOrder')}</button></article>)}</div>}
    </section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('materials')} title={t('requestedMaterials')} count={materials.length} />
      {materials.length === 0 ? <p className="department-empty">{t('noProductionNeed')}</p> : <div className="department-table-wrap"><table className="department-table"><thead><tr><th>{t('item')}</th><th>{t('available')}</th><th>{t('quantity')}</th><th>{t('materialShortage')}</th><th>{t('reason')}</th></tr></thead><tbody>{materials.map((need) => { const shortage = Math.max(0, need.quantity - need.item.stockOnHand); return <tr key={need.item.id}><td><strong>{need.item.name}</strong><small>{need.item.sku}</small></td><td>{formatStock(need.item.stockOnHand, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{formatStock(need.quantity, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td className={shortage > 0 ? 'department-low' : ''}>{formatStock(shortage, need.item.baseUnit, locale === 'ar' ? 'ar-MA' : 'en-MA')}</td><td>{need.reasons.join(', ')}</td></tr>; })}</tbody></table></div>}
    </section>
    <section className="surface operations-surface"><SectionHeading eyebrow={t('production')} title={t('productionQueue')} count={data.productionOrders.length} />
      {data.productionOrders.length === 0 ? <p className="department-empty">{t('noProduction')}</p> : <div className="department-record-list">{data.productionOrders.map((order) => { const item = data.items.find((entry) => entry.id === order.itemId); return <article className="department-record" key={order.id}><div><div className="operation-record-title"><strong>{order.number}</strong><span className={`status ${order.status === 'completed' ? 'status-ready' : 'status-warning'}`}>{t(order.status === 'in_progress' ? 'inProgress' : order.status)}</span></div><h3>{item?.name}</h3></div><div className="production-target"><span>{t('planned')}</span><strong>{formatStock(order.targetQuantity, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div><div className="operation-record-action">{order.status === 'planned' ? <button className="button button-secondary" onClick={() => onStartProduction(order.id)}>{t('startProduction')}</button> : order.status === 'in_progress' ? <button className="button button-primary" onClick={() => onCompleteProduction(order.id)}>{t('completeProduction')}</button> : <span className="done-indicator"><Check size={15} />{t('completed')}</span>}</div></article>; })}</div>}
    </section>
  </div>;
}

function ClientsDepartment({ data, onSaveClient }: { data: WorkspaceData; onSaveClient: (client: ClientAccount) => void }) {
  const { t } = useLocale();
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
  return <section className="surface operations-surface"><div className="section-heading"><div><p className="section-kicker">{t('navClients')}</p><h2>{t('clientsSubtitle')}</h2></div><button className="button button-primary" onClick={() => setOpen(!open)}><Plus size={16} />{t('addClient')}</button></div>
    {open && <form className="quick-form" onSubmit={submit}><input placeholder={t('customerOrStore')} value={name} onChange={(event) => setName(event.target.value)} required /><input placeholder={t('contact')} value={contactName} onChange={(event) => setContactName(event.target.value)} /><input placeholder={t('phone')} value={phone} onChange={(event) => setPhone(event.target.value)} /><input placeholder={t('city')} value={city} onChange={(event) => setCity(event.target.value)} /><input placeholder={t('address')} value={address} onChange={(event) => setAddress(event.target.value)} /><button className="button button-primary" type="submit">{t('saveChanges')}</button></form>}
    <div className="department-table-wrap"><table className="department-table"><thead><tr><th>{t('customerOrStore')}</th><th>{t('contact')}</th><th>{t('phone')}</th><th>{t('city')}</th><th>{t('openOrders')}</th><th>{t('outstandingInvoices')}</th></tr></thead><tbody>{data.clients.filter((client) => client.active).map((client) => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.address}</small></td><td>{client.contactName || '—'}</td><td dir="ltr">{client.phone || '—'}</td><td>{client.city || '—'}</td><td>{data.orders.filter((order) => order.clientId === client.id && order.status === 'confirmed').length}</td><td>{formatMad(data.invoices.filter((invoice) => invoice.clientId === client.id).reduce((sum, invoice) => sum + invoice.amountMad - invoice.paidMad, 0), locale)}</td></tr>)}</tbody></table></div>
    {data.clients.length === 0 && <p className="department-empty">{t('noClients')}</p>}
  </section>;
}

function InvoiceDepartment({ data, onCreateInvoice, onRecordPayment }: { data: WorkspaceData; onCreateInvoice: (deliveryId: string) => void; onRecordPayment: (invoiceId: string, amount: number) => void }) {
  const { t, locale } = useLocale();
  const uninvoiced = data.deliveryNotes.filter((note) => !data.invoices.some((invoice) => invoice.deliveryNoteId === note.id));
  return <div className="department-stack"><section className="surface operations-surface"><SectionHeading eyebrow={t('invoiceNumber')} title={t('createInvoice')} count={uninvoiced.length} />
    {uninvoiced.length > 0 && <div className="unbilled-list">{uninvoiced.map((note) => <div className="unbilled-row" key={note.id}><div><strong>{note.customer}</strong><small>{note.number} · {dateLabel(note.createdAt, locale)}</small></div><strong>{formatMad(note.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMad, 0), locale)}</strong><button className="button button-secondary" onClick={() => onCreateInvoice(note.id)}><ReceiptText size={15} />{t('createInvoice')}</button></div>)}</div>}
    {uninvoiced.length === 0 && <p className="department-empty">{t('noUnbilledDeliveries')}</p>}
  </section><section className="surface operations-surface"><SectionHeading eyebrow={t('navInvoices')} title={t('outstandingInvoices')} count={data.invoices.length} /><p className="preview-footnote">{t('notLegalInvoice')}</p>
    {data.invoices.length === 0 ? <p className="department-empty">{t('noInvoices')}</p> : <div className="department-record-list">{data.invoices.map((invoice) => { const due = Math.max(0, invoice.amountMad - invoice.paidMad); return <article className="department-record" key={invoice.id}><div><div className="operation-record-title"><strong>{invoice.number}</strong><span className={`status ${due === 0 ? 'status-ready' : 'status-warning'}`}>{t(due === 0 ? 'paidInFull' : invoice.paidMad > 0 ? 'partiallyPaid' : 'unpaid')}</span></div><h3>{invoice.customer}</h3><small>{invoice.deliveryNumber} · {dateLabel(invoice.issuedAt, locale)}</small></div><div className="invoice-amount"><span>{t('total')}</span><strong>{formatMad(invoice.amountMad, locale)}</strong></div><div className="invoice-amount"><span>{t('balanceDue')}</span><strong>{formatMad(due, locale)}</strong></div>{due > 0 && <button className="button button-secondary" onClick={() => onRecordPayment(invoice.id, due)}>{t('recordPayment')}</button>}</article>; })}</div>}
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
    <form className="quick-form return-form" onSubmit={submit}><select value={deliveryId} onChange={(event) => { setDeliveryId(event.target.value); setItemId(''); }} required><option value="">{t('selectDelivery')}</option>{deliveredNotes.map((note) => <option key={note.id} value={note.id}>{note.number} · {note.customer}</option>)}</select><select value={itemId} onChange={(event) => setItemId(event.target.value)} required disabled={!selectedDelivery}><option value="">{t('item')}</option>{selectedDelivery?.lines.map((line) => <option key={line.itemId} value={line.itemId}>{line.name}</option>)}</select><input type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label={t('quantity')} required /><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('returnReason')} required /><button className="button button-primary" type="submit">{t('requestReturn')}</button></form>
  </section><section className="surface operations-surface"><SectionHeading eyebrow={t('inspection')} title={t('navReturns')} count={data.returns.length} />
    {data.returns.length === 0 ? <p className="department-empty">{t('noReturns')}</p> : <div className="department-record-list">{data.returns.map((record) => <ReturnRecord key={record.id} record={record} data={data} onReceive={onReceiveReturn} onResolve={onResolveReturn} />)}</div>}
  </section></div>;
}

function ReturnRecord({ record, data, onReceive, onResolve }: { record: CustomerReturn; data: WorkspaceData; onReceive: (id: string) => void; onResolve: (id: string, decision: 'release' | 'reject') => void }) {
  const { t, locale } = useLocale();
  return <article className="department-record"><div><div className="operation-record-title"><strong>{record.number}</strong><span className={`status ${record.status === 'released' ? 'status-ready' : record.status === 'rejected' ? 'status-empty' : 'status-warning'}`}>{t(record.status)}</span></div><h3>{record.customer}</h3><small>{record.deliveryNumber} · {record.reason}</small></div><div className="department-record-lines">{record.lines.map((line) => { const item = data.items.find((candidate) => candidate.id === line.itemId); return <div className="operation-line" key={line.itemId}><span>{item?.name}</span><strong>{formatStock(line.quantity, item?.baseUnit ?? 'each', locale === 'ar' ? 'ar-MA' : 'en-MA')}</strong></div>; })}</div><div className="operation-record-action">{record.status === 'requested' ? <button className="button button-secondary" onClick={() => onReceive(record.id)}>{t('inspectReturn')}</button> : record.status === 'inspection' ? <div className="return-actions"><button className="button button-secondary" onClick={() => onResolve(record.id, 'release')}>{t('releaseReturn')}</button><button className="button button-secondary" onClick={() => onResolve(record.id, 'reject')}>{t('rejectReturn')}</button></div> : <span className="done-indicator"><Check size={14} />{t(record.status)}</span>}</div></article>;
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
  return <section className="surface operations-surface"><SectionHeading eyebrow={t('navAccess')} title={t('accessSubtitle')} /><div className="access-warning"><CircleAlert size={16} /><p>{t('accessNote')}</p></div><div className="access-grid"><div className="access-row access-head"><span>{t('navigation')}</span>{roles.map((role) => <strong key={role}>{t(ROLE_LABEL_KEYS[role])}</strong>)}</div>{WORKSPACE_PAGES.map((page) => <div className="access-row" key={page}><span>{t(PAGE_LABEL_KEYS[page] as Parameters<typeof t>[0])}</span>{roles.map((role) => <label className="access-toggle" key={`${page}-${role}`}><input type="checkbox" checked={roleAccess[role].includes(page)} disabled={page === 'overview'} onChange={() => toggle(role, page)} aria-label={`${t(ROLE_LABEL_KEYS[role])}: ${t(PAGE_LABEL_KEYS[page] as Parameters<typeof t>[0])}`} /><span /></label>)}</div>)}</div><p className="preview-footnote">{t('accessPreviewOnly')}</p></section>;
}

export function DepartmentWorkspace({
  page,
  role,
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
  if (page === 'inventory') return <InventoryDepartment data={data} />;
  if (page === 'purchasing') return <PurchasingDepartment data={data} onCreatePurchase={onCreatePurchase} onPurchaseOrdered={onPurchaseOrdered} onReceivePurchase={onReceivePurchase} onAddSupplier={onAddSupplier} />;
  if (page === 'production') return <ProductionDepartment data={data} onCreateProduction={onCreateProduction} onStartProduction={onStartProduction} onCompleteProduction={onCompleteProduction} />;
  if (page === 'clients') return <ClientsDepartment data={data} onSaveClient={onSaveClient} />;
  if (page === 'invoices') return <InvoiceDepartment data={data} onCreateInvoice={onCreateInvoice} onRecordPayment={onRecordPayment} />;
  if (page === 'returns') return <ReturnsDepartment data={data} onCreateReturn={onCreateReturn} onReceiveReturn={onReceiveReturn} onResolveReturn={onResolveReturn} />;
  if (page === 'access' && role === 'manager') return <AccessDepartment roleAccess={roleAccess} onChange={onRoleAccessChange} />;
  return null;
}
