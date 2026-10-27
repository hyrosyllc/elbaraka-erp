'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Boxes,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  Menu,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import { CatalogWorkspace } from './CatalogWorkspace';
import { DepartmentWorkspace } from './DepartmentWorkspace';
import { LocaleProvider, useLocale } from './LocaleContext';
import { OperationsWorkspace } from './OperationsWorkspace';
import {
  CatalogItem,
  ClientAccount,
  CustomerReturn,
  DeliveryNote,
  InventoryMovement,
  INITIAL_WORKSPACE,
  ProductionOrder,
  PurchaseOrder,
  PurchaseOrderLine,
  RoleAccess,
  SalesOrder,
  SalesInvoice,
  Supplier,
  WorkspacePage,
  WorkspaceRole,
  WORKSPACE_STORAGE_KEY,
  WorkspaceData,
  formatStock,
  formatMad,
  migrateWorkspace,
} from '@/lib/workspace';
import { Locale, PAGE_LABEL_KEYS, ROLE_LABEL_KEYS, TranslationKey, translate } from '@/lib/i18n';
import { availableQuantity, calculateFinishedProductionNeeds, calculatePurchaseNeeds } from '@/lib/operations';

type NewOrderLine = { itemId: string; quantity: number };

const navigation: { id: WorkspacePage; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'catalog', icon: Boxes },
  { id: 'inventory', icon: PackageCheck },
  { id: 'recipes', icon: FlaskConical },
  { id: 'purchasing', icon: ClipboardList },
  { id: 'production', icon: BarChart3 },
  { id: 'clients', icon: Boxes },
  { id: 'orders', icon: ClipboardList },
  { id: 'deliveries', icon: Truck },
  { id: 'invoices', icon: ReceiptText },
  { id: 'returns', icon: RotateCcw },
  { id: 'access', icon: ShieldCheck },
];

const pageSubtitleKeys: Record<WorkspacePage, TranslationKey> = {
  overview: 'overviewSubtitle', catalog: 'catalogSubtitle', inventory: 'inventorySubtitle',
  recipes: 'recipesSubtitle', purchasing: 'purchasingSubtitle', production: 'productionSubtitle',
  clients: 'clientsSubtitle', orders: 'ordersSubtitle', deliveries: 'deliveriesSubtitle',
  invoices: 'invoicesSubtitle', returns: 'returnsSubtitle', access: 'accessSubtitle',
};

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function getReservedQuantity(orders: SalesOrder[], itemId: string) {
  return orders
    .filter((order) => order.status === 'confirmed')
    .flatMap((order) => order.lines)
    .filter((line) => line.itemId === itemId)
    .reduce((total, line) => total + line.quantity, 0);
}

function Overview({ data, role, onNavigate }: { data: WorkspaceData; role: WorkspaceRole; onNavigate: (page: WorkspacePage) => void }) {
  const { t, locale } = useLocale();
  const openOrders = data.orders.filter((order) => order.status === 'confirmed');
  const lowStockItems = data.items.filter((item) => item.active && item.reorderPoint > 0 && availableQuantity(item, data.orders) <= item.reorderPoint);
  const purchaseNeeds = calculatePurchaseNeeds(data);
  const productionNeeds = calculateFinishedProductionNeeds(data);
  const outstandingMad = data.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amountMad - invoice.paidMad), 0);
  const monthlySales = data.invoices.reduce((sum, invoice) => sum + invoice.amountMad, 0);
  const localeTag = locale === 'ar' ? 'ar-MA' : 'en-MA';
  const metrics = role === 'manager'
    ? [
      { label: t('salesThisMonth'), value: formatMad(monthlySales, locale), foot: t('previewFinancials') },
      { label: t('openOrders'), value: String(openOrders.length), foot: t('awaitingDispatch') },
      { label: t('outstandingInvoices'), value: formatMad(outstandingMad, locale), foot: t('balanceDue') },
      { label: t('lowStock'), value: String(purchaseNeeds.length), foot: t('stockToBuy') },
    ]
    : role === 'purchasing'
      ? [
        { label: t('itemsToBuy'), value: String(purchaseNeeds.length), foot: t('stockToBuy') },
        { label: t('finishedGoodsToMake'), value: String(productionNeeds.length), foot: t('productionQueue') },
        { label: t('openPurchaseOrders'), value: String(data.purchaseOrders.filter((purchase) => purchase.status !== 'received').length), foot: t('supplierOrders') },
        { label: t('activeSuppliers'), value: String(data.suppliers.filter((supplier) => supplier.active).length), foot: t('purchasing') },
      ]
      : [
        { label: t('readyToDeliver'), value: String(openOrders.length), foot: t('openOrders') },
        { label: t('navDeliveries'), value: String(data.deliveryNotes.length), foot: t('completed') },
        { label: t('navReturns'), value: String(data.returns.filter((record) => record.status === 'requested' || record.status === 'inspection').length), foot: t('inspection') },
        { label: t('navClients'), value: String(data.clients.filter((client) => client.active).length), foot: t('customerOrStore') },
      ];

  const actions: { page: WorkspacePage; title: string; subtitle: string; icon: typeof Boxes; tone: string }[] = role === 'manager'
    ? [
      { page: 'catalog', title: t('addItem'), subtitle: t('catalogSubtitle'), icon: Boxes, tone: 'green' },
      { page: 'clients', title: t('addClient'), subtitle: t('clientsSubtitle'), icon: ClipboardList, tone: 'gold' },
      { page: 'access', title: t('navAccess'), subtitle: t('accessSubtitle'), icon: ShieldCheck, tone: 'red' },
    ]
    : role === 'purchasing'
      ? [
        { page: 'purchasing', title: t('stockToBuy'), subtitle: t('purchaseHint'), icon: Boxes, tone: 'gold' },
        { page: 'production', title: t('workersNeed'), subtitle: t('productionHint'), icon: FlaskConical, tone: 'green' },
        { page: 'catalog', title: t('navCatalog'), subtitle: t('catalogSubtitle'), icon: ClipboardList, tone: 'red' },
      ]
      : [
        { page: 'orders', title: t('openOrders'), subtitle: t('ordersSubtitle'), icon: ClipboardList, tone: 'gold' },
        { page: 'deliveries', title: t('readyToDeliver'), subtitle: t('deliveriesSubtitle'), icon: Truck, tone: 'green' },
        { page: 'returns', title: t('navReturns'), subtitle: t('returnsSubtitle'), icon: RotateCcw, tone: 'red' },
      ];

  const attentionItems = role === 'purchasing'
    ? purchaseNeeds.slice(0, 5).map((need) => ({ item: need.item, quantity: need.quantity, label: t('suggestedQty') }))
    : role === 'delivery'
      ? openOrders.slice(0, 5).map((order) => ({ order, label: t('navOrders') }))
      : lowStockItems.slice(0, 5).map((item) => ({ item, quantity: availableQuantity(item, data.orders), label: t('available') }));

  return (
    <div className="overview-grid">
      <section className="metric-strip" aria-label={t('operations')}>
        {metrics.map((metric, index) => <div className={`metric-block ${index === 2 ? 'metric-alert' : ''}`} key={metric.label}><span className="metric-label">{metric.label}</span><strong>{metric.value}</strong><span className="metric-foot">{metric.foot}</span></div>)}
      </section>
      <Card className="overview-main surface">
        <div className="section-heading"><div><p className="section-kicker">{t('needsAttention')}</p><h2>{role === 'purchasing' ? t('stockToBuy') : role === 'delivery' ? t('dispatchNext') : t('lowStock')}</h2></div><Button className="text-action" onClick={() => onNavigate(role === 'purchasing' ? 'purchasing' : role === 'delivery' ? 'orders' : 'inventory')}>{t('viewAll')}</Button></div>
        {attentionItems.length === 0 ? <p className="empty-note">{role === 'purchasing' ? t('noNeedToBuy') : role === 'delivery' ? t('noOrders') : t('noLowStock')}</p> : <div className="watch-list">{attentionItems.map((entry) => 'order' in entry ? <div className="watch-row" key={entry.order.id}><span className="item-mark type-finished_good" aria-hidden="true" /><div className="watch-copy"><strong>{entry.order.customer}</strong><span>{entry.order.number}</span></div><div className="watch-quantity"><strong>{entry.order.lines.reduce((sum, line) => sum + line.quantity, 0)} ea</strong><span>{entry.order.lines.length} {t('lines')}</span></div><span className="status status-warning">{t('confirmed')}</span></div> : <div className="watch-row" key={entry.item.id}><span className={`item-mark type-${entry.item.type}`} aria-hidden="true" /><div className="watch-copy"><strong>{entry.item.name}</strong><span>{entry.item.sku}</span></div><div className="watch-quantity"><strong>{formatStock(entry.quantity, entry.item.baseUnit, localeTag)}</strong><span>{entry.label}</span></div><span className="status status-warning">{t('low')}</span></div>)}</div>}
      </Card>
      <Card className="overview-side surface"><div className="section-heading"><div><p className="section-kicker">{t('nextActions')}</p><h2>{t('keepWorkMoving')}</h2></div><Activity size={18} aria-hidden="true" /></div>
        {actions.filter((action) => data.roleAccess[role].includes(action.page)).map((action) => { const Icon = action.icon; return <Button className="action-tile" key={action.page} onClick={() => onNavigate(action.page)}><span className={`action-icon action-icon-${action.tone}`}><Icon size={18} /></span><span><strong>{action.title}</strong><small>{action.subtitle}</small></span><Plus size={16} /></Button>; })}
        <div className="workflow-note"><PackageCheck size={18} /><p>{role === 'delivery' ? t('deliveryWorkflowNote') : role === 'purchasing' ? t('purchasingWorkflowNote') : t('managerWorkflowNote')}</p></div>
      </Card>
    </div>
  );
}

export function AdminWorkspace({
  authenticatedRole,
  fullName,
}: {
  authenticatedRole?: WorkspaceRole;
  fullName?: string;
} = {}) {
  const [page, setPage] = useState<WorkspacePage>('overview');
  const [data, setData] = useState<WorkspaceData>(INITIAL_WORKSPACE);
  const [locale, setLocale] = useState<Locale>('en');
  const [previewRole, setPreviewRole] = useState<WorkspaceRole>('manager');
  const role = authenticatedRole ?? previewRole;
  const [loaded, setLoaded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (saved) setData(migrateWorkspace(JSON.parse(saved)));
      const savedLocale = window.localStorage.getItem('elbaraka-locale-v1');
      if (savedLocale === 'en' || savedLocale === 'ar') setLocale(savedLocale);
      const savedRole = window.localStorage.getItem('elbaraka-preview-role-v1');
      if (!authenticatedRole && (savedRole === 'manager' || savedRole === 'purchasing' || savedRole === 'delivery')) {
        setPreviewRole(savedRole);
      }
      setSidebarCollapsed(window.localStorage.getItem('elbaraka-sidebar-collapsed-v1') === 'true');
    } catch {
      setData(INITIAL_WORKSPACE);
    } finally {
      setLoaded(true);
    }
  }, [authenticatedRole]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(data));
    } catch {
      setNotice('This browser could not save the preview changes.');
    }
  }, [data, loaded]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    if (loaded) window.localStorage.setItem('elbaraka-locale-v1', locale);
  }, [locale, loaded]);

  useEffect(() => {
    if (loaded && !authenticatedRole) window.localStorage.setItem('elbaraka-preview-role-v1', role);
  }, [role, loaded, authenticatedRole]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem('elbaraka-sidebar-collapsed-v1', String(sidebarCollapsed));
    } catch {
      setNotice('This browser could not save the sidebar preference.');
    }
  }, [sidebarCollapsed, loaded]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const navigate = (nextPage: WorkspacePage) => {
    setPage(nextPage);
    setMobileNavOpen(false);
  };

  const saveItem = (item: CatalogItem) => {
    setData((current) => {
      const exists = current.items.some((existing) => existing.id === item.id);
      return {
        ...current,
        items: exists
          ? current.items.map((existing) => existing.id === item.id ? item : existing)
          : [item, ...current.items],
      };
    });
    setNotice(`${item.name} ${data.items.some((existing) => existing.id === item.id) ? 'updated' : 'added'} to the preview catalog.`);
  };

  const setItemActive = (itemId: string, active: boolean) => {
    const item = data.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setData((current) => ({
      ...current,
      items: current.items.map((candidate) => candidate.id === itemId ? { ...candidate, active } : candidate),
    }));
    setNotice(`${item.name} ${active ? 'reactivated' : 'deactivated'}.`);
  };

  const createOrder = (customer: string, requestedLines: NewOrderLine[]) => {
    const lines = requestedLines.map(({ itemId, quantity }) => {
      const item = data.items.find((candidate) => candidate.id === itemId && candidate.active && candidate.type === 'finished_good');
      if (!item || !Number.isInteger(quantity) || quantity <= 0) return null;
      const available = item.stockOnHand - getReservedQuantity(data.orders, item.id);
      if (quantity > available) return null;
      return { itemId: item.id, sku: item.sku, name: item.name, quantity, unitPriceMad: item.salePriceMad };
    });

    if (!customer.trim() || lines.length === 0 || lines.some((line) => line === null)) {
      setNotice('Check the customer, quantities, and available finished stock.');
      return;
    }
    const client = data.clients.find((candidate) => candidate.active && candidate.name === customer.trim());
    if (!client) {
      setNotice('Choose an active client store before creating the order.');
      return;
    }

    const orderNumber = `SO-${String(1050 + data.orders.length).padStart(4, '0')}`;
    const order: SalesOrder = {
      id: createId('order'),
      number: orderNumber,
      clientId: client.id,
      customer: client.name,
      createdAt: new Date().toISOString(),
      status: 'confirmed',
      lines: lines.filter((line): line is NonNullable<typeof line> => line !== null),
    };
    setData((current) => ({ ...current, orders: [order, ...current.orders] }));
    setNotice(`${orderNumber} confirmed. Finished stock is reserved.`);
  };

  const createDeliveryNote = (orderId: string) => {
    const order = data.orders.find((candidate) => candidate.id === orderId && candidate.status === 'confirmed');
    if (!order) return;
    const orderLines = order.lines;
    const deliveredByItem = new Map<string, number>();
    for (const line of orderLines) {
      deliveredByItem.set(line.itemId, (deliveredByItem.get(line.itemId) ?? 0) + line.quantity);
    }
    const enoughStock = Array.from(deliveredByItem.entries()).every(([itemId, quantity]) => {
      const item = data.items.find((candidate) => candidate.id === itemId);
      return item && item.stockOnHand >= quantity;
    });
    if (!enoughStock) {
      setNotice('Stock changed in this preview. Review the order before dispatch.');
      return;
    }

    const note: DeliveryNote = {
      id: createId('delivery'),
      number: `DN-${String(1050 + data.deliveryNotes.length).padStart(4, '0')}`,
      orderId: order.id,
      orderNumber: order.number,
      clientId: order.clientId,
      customer: order.customer,
      createdAt: new Date().toISOString(),
      lines: orderLines.map((line) => ({ ...line })),
    };
    setData((current) => ({
      ...current,
      items: current.items.map((item) => {
        const delivered = deliveredByItem.get(item.id) ?? 0;
        return delivered ? { ...item, stockOnHand: item.stockOnHand - delivered } : item;
      }),
      orders: current.orders.map((candidate) => candidate.id === order.id ? { ...candidate, status: 'delivered' } : candidate),
      deliveryNotes: [note, ...current.deliveryNotes],
      movements: [...orderLines.reduce<InventoryMovement[]>((movements, line) => {
        const existing = movements.find((movement) => movement.itemId === line.itemId);
        if (existing) existing.quantityDelta -= line.quantity;
        else movements.push({ id: createId('movement'), itemId: line.itemId, quantityDelta: -line.quantity, kind: 'shipment', reference: note.number, createdAt: note.createdAt });
        return movements;
      }, []), ...current.movements],
    }));
    setNotice(`${note.number} created for ${order.customer}.`);
  };

  const addSupplier = (supplier: Supplier) => {
    setData((current) => ({ ...current, suppliers: [supplier, ...current.suppliers] }));
    setNotice(`${supplier.name} added to the supplier list.`);
  };

  const createPurchaseOrder = (supplierId: string, lines: PurchaseOrderLine[]) => {
    const supplier = data.suppliers.find((entry) => entry.id === supplierId && entry.active);
    if (!supplier || lines.length === 0) return;
    const purchase: PurchaseOrder = {
      id: createId('purchase'),
      number: `PO-${String(204 + data.purchaseOrders.length).padStart(4, '0')}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      createdAt: new Date().toISOString(),
      status: 'draft',
      lines,
    };
    setData((current) => ({ ...current, purchaseOrders: [purchase, ...current.purchaseOrders] }));
    setNotice(`${purchase.number} purchase draft created.`);
  };

  const markPurchaseOrdered = (purchaseId: string) => {
    setData((current) => ({
      ...current,
      purchaseOrders: current.purchaseOrders.map((purchase) => purchase.id === purchaseId && purchase.status === 'draft' ? { ...purchase, status: 'ordered' } : purchase),
    }));
    setNotice('Purchase order marked as ordered.');
  };

  const receivePurchaseOrder = (purchaseId: string) => {
    const purchase = data.purchaseOrders.find((entry) => entry.id === purchaseId && entry.status !== 'received');
    if (!purchase) return;
    const receiptTime = new Date().toISOString();
    const receivedByItem = new Map<string, number>();
    for (const line of purchase.lines) receivedByItem.set(line.itemId, Math.max(0, line.quantity - line.receivedQuantity));
    setData((current) => ({
      ...current,
      items: current.items.map((item) => ({ ...item, stockOnHand: item.stockOnHand + (receivedByItem.get(item.id) ?? 0) })),
      purchaseOrders: current.purchaseOrders.map((entry) => entry.id === purchaseId ? { ...entry, status: 'received', lines: entry.lines.map((line) => ({ ...line, receivedQuantity: line.quantity })) } : entry),
      movements: [...purchase.lines.filter((line) => receivedByItem.get(line.itemId)).map((line) => ({ id: createId('movement'), itemId: line.itemId, quantityDelta: receivedByItem.get(line.itemId) ?? 0, kind: 'purchase_receipt' as const, reference: purchase.number, createdAt: receiptTime })), ...current.movements],
    }));
    setNotice(`${purchase.number} received. Stock movements were recorded in the preview.`);
  };

  const addClient = (client: ClientAccount) => {
    setData((current) => ({ ...current, clients: [client, ...current.clients] }));
    setNotice(`${client.name} added to client stores.`);
  };

  const createProductionOrder = (itemId: string, quantity: number) => {
    const item = data.items.find((entry) => entry.id === itemId && entry.active && (entry.type === 'blend' || entry.type === 'finished_good'));
    if (!item || !Number.isFinite(quantity) || quantity <= 0) return;
    const production: ProductionOrder = {
      id: createId('production'),
      number: `MO-${String(58 + data.productionOrders.length).padStart(4, '0')}`,
      itemId,
      targetQuantity: quantity,
      createdAt: new Date().toISOString(),
      status: 'planned',
    };
    setData((current) => ({ ...current, productionOrders: [production, ...current.productionOrders] }));
    setNotice(`${production.number} planned for ${item.name}.`);
  };

  const startProduction = (productionId: string) => {
    setData((current) => ({ ...current, productionOrders: current.productionOrders.map((order) => order.id === productionId && order.status === 'planned' ? { ...order, status: 'in_progress' } : order) }));
    setNotice('Production batch started.');
  };

  const completeProduction = (productionId: string) => {
    const production = data.productionOrders.find((order) => order.id === productionId && order.status === 'in_progress');
    const output = data.items.find((item) => item.id === production?.itemId);
    if (!production || !output || !output.recipeOutputQuantity || output.recipeOutputQuantity <= 0 || output.components.length === 0) {
      setNotice('This item needs a formula before production can be completed.');
      return;
    }
    const recipeOutputQuantity = output.recipeOutputQuantity;
    const inputNeeds = output.components.map((component) => ({
      item: data.items.find((item) => item.id === component.itemId),
      quantity: component.quantity * production.targetQuantity / recipeOutputQuantity,
    }));
    const shortage = inputNeeds.find((need) => !need.item || need.item.stockOnHand < need.quantity);
    if (shortage) {
      setNotice(`${shortage.item?.name ?? 'A formula component'} is short. Receive materials or make the intermediate blend first.`);
      return;
    }
    const completedAt = new Date().toISOString();
    const productionMoves: InventoryMovement[] = [
      ...inputNeeds.map((need) => ({ id: createId('movement'), itemId: need.item!.id, quantityDelta: -need.quantity, kind: 'production_use' as const, reference: production.number, createdAt: completedAt })),
      { id: createId('movement'), itemId: output.id, quantityDelta: production.targetQuantity, kind: 'production_output', reference: production.number, createdAt: completedAt },
    ];
    setData((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id === output.id) return { ...item, stockOnHand: item.stockOnHand + production.targetQuantity };
        const consumed = inputNeeds.find((need) => need.item?.id === item.id)?.quantity ?? 0;
        return consumed ? { ...item, stockOnHand: item.stockOnHand - consumed } : item;
      }),
      productionOrders: current.productionOrders.map((order) => order.id === productionId ? { ...order, status: 'completed' } : order),
      movements: [...productionMoves, ...current.movements],
    }));
    setNotice(`${production.number} completed. Materials and output recorded.`);
  };

  const createInvoice = (deliveryNoteId: string) => {
    const note = data.deliveryNotes.find((entry) => entry.id === deliveryNoteId);
    if (!note || data.invoices.some((invoice) => invoice.deliveryNoteId === note.id)) return;
    const invoice: SalesInvoice = {
      id: createId('invoice'),
      number: `FAC-${new Date().getFullYear()}-${String(48 + data.invoices.length).padStart(4, '0')}`,
      deliveryNoteId: note.id,
      deliveryNumber: note.number,
      clientId: note.clientId,
      customer: note.customer,
      issuedAt: new Date().toISOString(),
      amountMad: note.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMad, 0),
      paidMad: 0,
    };
    setData((current) => ({ ...current, invoices: [invoice, ...current.invoices] }));
    setNotice(`${invoice.number} created from ${note.number}.`);
  };

  const recordPayment = (invoiceId: string, amount: number) => {
    const invoice = data.invoices.find((entry) => entry.id === invoiceId);
    if (!invoice || !Number.isFinite(amount) || amount <= 0) return;
    setData((current) => ({ ...current, invoices: current.invoices.map((entry) => entry.id === invoiceId ? { ...entry, paidMad: Math.min(entry.amountMad, entry.paidMad + amount) } : entry) }));
    setNotice('Payment recorded in the preview ledger.');
  };

  const createReturn = (deliveryNoteId: string, reason: string, itemId: string, quantity: number) => {
    const note = data.deliveryNotes.find((entry) => entry.id === deliveryNoteId);
    const line = note?.lines.find((entry) => entry.itemId === itemId);
    const priorQuantity = data.returns.filter((record) => record.deliveryNoteId === deliveryNoteId && record.status !== 'rejected').flatMap((record) => record.lines).filter((entry) => entry.itemId === itemId).reduce((sum, entry) => sum + entry.quantity, 0);
    if (!note || !line || !reason.trim() || !Number.isInteger(quantity) || quantity <= 0 || quantity + priorQuantity > line.quantity) {
      setNotice('Check the delivery note and returned quantity. It cannot exceed the delivered amount.');
      return;
    }
    const record: CustomerReturn = {
      id: createId('return'),
      number: `RET-${String(31 + data.returns.length).padStart(4, '0')}`,
      deliveryNoteId: note.id,
      deliveryNumber: note.number,
      clientId: note.clientId,
      customer: note.customer,
      createdAt: new Date().toISOString(),
      reason,
      status: 'requested',
      lines: [{ itemId, quantity }],
    };
    setData((current) => ({ ...current, returns: [record, ...current.returns] }));
    setNotice(`${record.number} received as a return request.`);
  };

  const receiveReturn = (returnId: string) => {
    const record = data.returns.find((entry) => entry.id === returnId && entry.status === 'requested');
    if (!record) return;
    const receivedAt = new Date().toISOString();
    setData((current) => ({
      ...current,
      items: current.items.map((item) => {
        const quantity = record.lines.find((line) => line.itemId === item.id)?.quantity ?? 0;
        return quantity ? { ...item, quarantinedStock: item.quarantinedStock + quantity } : item;
      }),
      returns: current.returns.map((entry) => entry.id === returnId ? { ...entry, status: 'inspection' } : entry),
      movements: [...record.lines.map((line) => ({ id: createId('movement'), itemId: line.itemId, quantityDelta: line.quantity, kind: 'customer_return' as const, reference: record.number, createdAt: receivedAt })), ...current.movements],
    }));
    setNotice('Returned goods moved to inspection quarantine.');
  };

  const resolveReturn = (returnId: string, decision: 'release' | 'reject') => {
    const record = data.returns.find((entry) => entry.id === returnId && entry.status === 'inspection');
    if (!record) return;
    const resolvedAt = new Date().toISOString();
    const released = decision === 'release';
    setData((current) => ({
      ...current,
      items: current.items.map((item) => {
        const quantity = record.lines.find((line) => line.itemId === item.id)?.quantity ?? 0;
        if (!quantity) return item;
        return { ...item, quarantinedStock: Math.max(0, item.quarantinedStock - quantity), stockOnHand: released ? item.stockOnHand + quantity : item.stockOnHand };
      }),
      returns: current.returns.map((entry) => entry.id === returnId ? { ...entry, status: released ? 'released' : 'rejected' } : entry),
      movements: [...record.lines.map((line) => ({ id: createId('movement'), itemId: line.itemId, quantityDelta: released ? line.quantity : -line.quantity, kind: released ? 'return_release' as const : 'return_rejected' as const, reference: record.number, createdAt: resolvedAt })), ...current.movements],
    }));
    setNotice(released ? 'Inspected items released back to available stock.' : 'Inspected items rejected and written off.');
  };

  const setRoleAccess = (roleAccess: RoleAccess) => {
    setData((current) => ({ ...current, roleAccess }));
    setNotice('Role visibility updated in this browser preview.');
  };

  const t = (key: TranslationKey) => translate(locale, key);
  const pageTitle = page === 'overview' ? t('overviewTitle') : t(PAGE_LABEL_KEYS[page] as TranslationKey);
  const pageSubtitle = t(pageSubtitleKeys[page]);
  const visibleNavigation = navigation.filter((item) => data.roleAccess[role].includes(item.id));
  const changeRole = (nextRole: WorkspaceRole) => {
    setPreviewRole(nextRole);
    if (!data.roleAccess[nextRole].includes(page)) setPage('overview');
  };

  return (
    <LocaleProvider locale={locale}>
    <div className={`app-frame ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <aside id="primary-navigation" className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`} aria-label={t('navigation')}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>elbaraka</strong><small>{t('brandSubtitle')}</small></div>
          <Button
            className="icon-button sidebar-collapse"
            aria-label={t(sidebarCollapsed ? 'expandSidebar' : 'collapseSidebar')}
            aria-expanded={!sidebarCollapsed}
            aria-controls="primary-navigation"
            title={t(sidebarCollapsed ? 'expandSidebar' : 'collapseSidebar')}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </Button>
          <Button className="icon-button sidebar-close" aria-label={t('close')} onClick={() => setMobileNavOpen(false)}><X size={18} /></Button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">E</div>
          <div><strong>{t('workspaceName')}</strong><small>{t('workspaceMain')}</small></div>
        </div>

        <div className="sidebar-navigation">
          <p className="nav-caption">{t('navigation')}</p>
          <nav className="primary-nav">
            {visibleNavigation.map((item) => {
              const Icon = item.icon;
              const label = t(PAGE_LABEL_KEYS[item.id] as TranslationKey);
              return (
                <Button
                  key={item.id}
                  className={`nav-link ${page === item.id ? 'nav-link-active' : ''}`}
                  onClick={() => navigate(item.id)}
                  aria-label={label}
                  title={label}
                  aria-current={page === item.id ? 'page' : undefined}
                >
                  <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                  {item.id === 'orders' && data.orders.some((order) => order.status === 'confirmed') && <i className="nav-count">{data.orders.filter((order) => order.status === 'confirmed').length}</i>}
                </Button>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <div className="help-symbol">?</div>
            <div><strong>{t('needHelp')}</strong><small>{t('operationsGuide')}</small></div>
          </div>
          <div className="user-profile">
            <div className="user-avatar">A</div>
            <div><strong>{fullName || t(ROLE_LABEL_KEYS[role] as TranslationKey)}</strong><small>{authenticatedRole ? t(ROLE_LABEL_KEYS[role] as TranslationKey) : t('localWorkspace')}</small></div>
            <span className="user-presence" aria-label={t('previewWorkspace')} />
          </div>
        </div>
      </aside>

      {mobileNavOpen && <Button className="nav-scrim" aria-label={t('close')} onClick={() => setMobileNavOpen(false)} />}

      <main className="main-panel">
        <header className="topbar">
          <Button className="icon-button mobile-menu" aria-label={t('openMenu')} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><Menu size={20} /></Button>
          <div className="breadcrumbs"><span>{t('workspaceName')}</span><span className="crumb-divider">/</span><strong>{pageTitle}</strong></div>
          {authenticatedRole
            ? <span className="role-picker">{t(ROLE_LABEL_KEYS[role] as TranslationKey)}</span>
            : <label className="role-picker"><span>{t('previewRole')}</span><Select value={role} onValueChange={(value) => changeRole(value as WorkspaceRole)}><SelectTrigger className="min-w-[136px]"><SelectValue /></SelectTrigger><SelectContent>{(['manager', 'purchasing', 'delivery'] as WorkspaceRole[]).map((value) => <SelectItem key={value} value={value}>{t(ROLE_LABEL_KEYS[value] as TranslationKey)}</SelectItem>)}</SelectContent></Select></label>}
          <div className="locale-switch" role="group" aria-label={t('language')}><Button className={locale === 'en' ? 'locale-active' : ''} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}>EN</Button><Button className={locale === 'ar' ? 'locale-active' : ''} onClick={() => setLocale('ar')} aria-pressed={locale === 'ar'}>ع</Button></div>
          <div className="topbar-meta"><span className="live-indicator" /> {t(authenticatedRole ? 'liveMasterData' : 'previewWorkspace')}</div>
        </header>

        <div className="page-content">
          <div className="preview-banner" role="note">
            <Activity size={16} />
            <span><strong>{t(authenticatedRole ? 'liveDataTitle' : 'previewTitle')}</strong> {t(authenticatedRole ? 'liveDataNotice' : 'previewNotice')}</span>
          </div>
          <div className="page-heading">
            <div>
              <p className="breadcrumb-label">{t('operations')} <span>/</span> {pageTitle}</p>
              <h1>{pageTitle}</h1>
              <p className="page-subtitle">{pageSubtitle}</p>
            </div>
            <div className="page-heading-action">
              {page === 'overview' && role === 'manager' && <Button className="button button-primary" onClick={() => navigate('catalog')}><Plus size={17} /> {t('addItem')}</Button>}
              {page === 'catalog' && <span className="catalog-total">{data.items.filter((item) => item.active).length} {t('activeItems')}</span>}
            </div>
          </div>

          {page === 'overview' && <Overview data={data} role={role} onNavigate={navigate} />}
          {page === 'catalog' && <CatalogWorkspace items={data.items} orders={data.orders} onSave={saveItem} onSetActive={setItemActive} />}
          {page === 'recipes' && <RecipeWorkspace items={data.items} />}
          {(page === 'orders' || page === 'deliveries') && (
            <OperationsWorkspace
              page={page}
              data={data}
              clients={data.clients}
              onCreateOrder={createOrder}
              onCreateDelivery={createDeliveryNote}
              onNavigate={navigate}
            />
          )}
          {page !== 'overview' && page !== 'catalog' && page !== 'recipes' && page !== 'orders' && page !== 'deliveries' && <DepartmentWorkspace
            page={page}
            role={role}
            isAuthenticated={Boolean(authenticatedRole)}
            data={data}
            roleAccess={data.roleAccess}
            onCreatePurchase={createPurchaseOrder}
            onPurchaseOrdered={markPurchaseOrdered}
            onReceivePurchase={receivePurchaseOrder}
            onAddSupplier={addSupplier}
            onCreateProduction={createProductionOrder}
            onStartProduction={startProduction}
            onCompleteProduction={completeProduction}
            onSaveClient={addClient}
            onCreateInvoice={createInvoice}
            onRecordPayment={recordPayment}
            onCreateReturn={createReturn}
            onReceiveReturn={receiveReturn}
            onResolveReturn={resolveReturn}
            onRoleAccessChange={setRoleAccess}
          />}
        </div>
      </main>

      {notice && <div className="toast-message" role="status">{notice}</div>}
    </div>
    </LocaleProvider>
  );
}

function RecipeWorkspace({ items }: { items: CatalogItem[] }) {
  const recipeOutputs = items.filter((item) => item.active && ['blend', 'finished_good'].includes(item.type));

  return (
    <section className="surface recipe-surface">
      <div className="section-heading">
        <div><p className="section-kicker">Formulation</p><h2>Blend and pack components</h2></div>
        <span className="status status-neutral">Preview formulas</span>
      </div>
      <p className="recipe-intro">A blend is built from ingredients measured in grams. Finished goods can include a spice component and packaging counted by each.</p>
      <div className="recipe-list">
        {recipeOutputs.map((output) => (
          <article className="recipe-row" key={output.id}>
            <div className={`item-mark type-${output.type}`} aria-hidden="true" />
            <div className="recipe-output"><strong>{output.name}</strong><span>{output.sku} · {output.type === 'blend' ? `Batch output ${formatStock(output.recipeOutputQuantity ?? 0, 'g')}` : `${output.netWeightG} g per each`}</span></div>
            <div className="recipe-components">
              {output.components.length ? output.components.map((component) => {
                const input = items.find((item) => item.id === component.itemId);
                if (!input) return null;
                return <span className="component-chip" key={`${output.id}-${component.itemId}`}>{formatStock(component.quantity, input.baseUnit)} {input.name}</span>;
              }) : <span className="empty-component">No formula components entered</span>}
            </div>
            <span className={`status ${output.components.length ? 'status-ready' : 'status-warning'}`}>{output.components.length ? 'Formula entered' : 'Needs formula'}</span>
          </article>
        ))}
        {recipeOutputs.length === 0 && <p className="empty-note">Add a blend or finished good to begin recording formulas.</p>}
      </div>
      <p className="preview-footnote">Formula approval and immutable versions will be enforced by the production database, not this preview.</p>
    </section>
  );
}