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

function itemMarkerClass(type: CatalogItem['type']) {
  switch (type) {
    case 'raw_material': return 'bg-[#597c5d]';
    case 'blend': return 'bg-[#d49a31]';
    case 'packaging': return 'bg-[#6487a0]';
    case 'finished_good': return 'bg-[#bc6249]';
  }
}

function actionToneClass(tone: string) {
  switch (tone) {
    case 'green': return 'bg-[#eaf3eb] text-[#437451]';
    case 'gold': return 'bg-[#fbf2df] text-[#9a6e1d]';
    default: return 'bg-[#faece8] text-[#a64e3b]';
  }
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
    <div className="grid grid-cols-1 gap-[18px] min-[921px]:[grid-template-columns:minmax(0,1.4fr)_minmax(300px,.85fr)]">
      <section className="col-span-full grid grid-cols-2 overflow-hidden rounded-[9px] border border-[#dfe5df] bg-white min-[761px]:grid-cols-4" aria-label={t('operations')}>
        {metrics.map((metric, index) => <div className={`grid min-h-[102px] content-center gap-[5px] border-b border-[#dfe5df] p-[14px] min-[761px]:min-h-[114px] min-[761px]:border-b-0 min-[761px]:border-r min-[761px]:px-[21px] min-[761px]:py-[17px] [&:nth-child(2)]:border-r-0 min-[761px]:[&:nth-child(2)]:border-r [&:nth-child(3)]:border-b-0 [&:nth-child(4)]:border-b-0 ${index === 2 ? '[&>strong]:text-[#a95640]' : ''}`} key={metric.label}><span className="text-[11px] font-medium text-[#7f8b83]">{metric.label}</span><strong>{metric.value}</strong><span className="text-[10px] text-[#849088]">{metric.foot}</span></div>)}
      </section>
      <Card className="px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4 max-[520px]:px-3 max-[520px]:py-[14px] rounded-[9px] border border-[#dfe5df] bg-[#fdfefc]">
        <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]"><div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{t('needsAttention')}</p><h2>{role === 'purchasing' ? t('stockToBuy') : role === 'delivery' ? t('dispatchNext') : t('lowStock')}</h2></div><Button className="min-h-0 border-0 bg-transparent px-0 py-[5px] text-[11px] font-bold text-[#1f6041] hover:bg-transparent hover:text-[#124b38] hover:underline hover:underline-offset-[3px]" onClick={() => onNavigate(role === 'purchasing' ? 'purchasing' : role === 'delivery' ? 'orders' : 'inventory')}>{t('viewAll')}</Button></div>
        {attentionItems.length === 0 ? <p className="my-5 mb-1 text-xs text-[#7f8b83]">{role === 'purchasing' ? t('noNeedToBuy') : role === 'delivery' ? t('noOrders') : t('noLowStock')}</p> : <div className="grid">{attentionItems.map((entry) => 'order' in entry ? <div className="grid min-h-[63px] grid-cols-[9px_minmax(100px,1fr)_auto_auto] items-center gap-3 border-t border-[#edf0ed] max-[520px]:min-h-[66px] max-[520px]:grid-cols-[7px_minmax(70px,1fr)_auto] max-[520px]:gap-2" key={entry.order.id}><span className="block h-[31px] w-2 shrink-0 rounded-[3px] bg-[#bc6249]" aria-hidden="true" /><div className="grid min-w-0 gap-1 [&_strong]:overflow-hidden [&_strong]:text-xs [&_strong]:font-semibold [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[#33473d] [&_span]:font-mono [&_span]:text-[10px] [&_span]:text-[#89958d]"><strong>{entry.order.customer}</strong><span>{entry.order.number}</span></div><div className="grid gap-[3px] text-right max-[520px]:col-start-3 max-[520px]:row-start-1 [&_strong]:font-mono [&_strong]:text-[11px] [&_strong]:font-medium [&_strong]:text-[#52645a] [&_span]:text-[9px] [&_span]:text-[#9aa49d]"><strong>{entry.order.lines.reduce((sum, line) => sum + line.quantity, 0)} ea</strong><span>{entry.order.lines.length} {t('lines')}</span></div><span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold bg-[#fbf2df] text-[#8a651d]">{t('confirmed')}</span></div> : <div className="grid min-h-[63px] grid-cols-[9px_minmax(100px,1fr)_auto_auto] items-center gap-3 border-t border-[#edf0ed] max-[520px]:min-h-[66px] max-[520px]:grid-cols-[7px_minmax(70px,1fr)_auto] max-[520px]:gap-2" key={entry.item.id}><span className={`block h-[31px] w-2 shrink-0 rounded-[3px] ${itemMarkerClass(entry.item.type)}`} aria-hidden="true" /><div className="grid min-w-0 gap-1 [&_strong]:overflow-hidden [&_strong]:text-xs [&_strong]:font-semibold [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[#33473d] [&_span]:font-mono [&_span]:text-[10px] [&_span]:text-[#89958d]"><strong>{entry.item.name}</strong><span>{entry.item.sku}</span></div><div className="grid gap-[3px] text-right max-[520px]:col-start-3 max-[520px]:row-start-1 [&_strong]:font-mono [&_strong]:text-[11px] [&_strong]:font-medium [&_strong]:text-[#52645a] [&_span]:text-[9px] [&_span]:text-[#9aa49d]"><strong>{formatStock(entry.quantity, entry.item.baseUnit, localeTag)}</strong><span>{entry.label}</span></div><span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold bg-[#fbf2df] text-[#8a651d]">{t('low')}</span></div>)}</div>}
      </Card>
      <Card className="flex min-h-[280px] flex-col px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4 max-[520px]:px-3 max-[520px]:py-[14px] rounded-[9px] border border-[#dfe5df] bg-[#fdfefc]"><div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]"><div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{t('nextActions')}</p><h2>{t('keepWorkMoving')}</h2></div><Activity size={18} aria-hidden="true" /></div>
        {actions.filter((action) => data.roleAccess[role].includes(action.page)).map((action) => { const Icon = action.icon; return <Button className="grid min-h-[58px] grid-cols-[33px_minmax(0,1fr)_16px] items-center gap-2.5 border-0 border-t border-[#edf0ed] bg-transparent px-px py-[7px] text-left hover:bg-transparent [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-1 [&_strong]:text-[11px] [&_strong]:font-bold [&_strong]:text-[#405248] [&_small]:text-[10px] [&_small]:text-[#8a968e] [&>svg]:text-[#98a39b] [&:hover_strong]:text-[#1f6041] [&:hover>svg]:text-[#1f6041]" key={action.page} onClick={() => onNavigate(action.page)}><span className={`grid size-[31px] place-items-center rounded-[7px] ${actionToneClass(action.tone)}`}><Icon size={18} /></span><span><strong>{action.title}</strong><small>{action.subtitle}</small></span><Plus size={16} /></Button>; })}
        <div className="mt-auto flex items-start gap-[9px] rounded-md bg-[#f0f5f0] px-[11px] py-3 text-[#557260] [&_svg]:mt-px [&_svg]:shrink-0 [&_p]:m-0 [&_p]:text-[10px] [&_p]:leading-[1.5] [&_p]:text-[#687d6f]"><PackageCheck size={18} /><p>{role === 'delivery' ? t('deliveryWorkflowNote') : role === 'purchasing' ? t('purchasingWorkflowNote') : t('managerWorkflowNote')}</p></div>
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
    <div className="min-h-screen" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <aside id="primary-navigation" className={`fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-[#dfe5df] bg-[#fbfcfa] pb-[14px] pt-[22px] transition-[width,transform] duration-200 max-[760px]:w-[min(290px,calc(100vw-55px))] max-[760px]:px-[15px] max-[760px]:shadow-[12px_0_36px_rgb(16_39_27_/_10%)] max-[760px]:transition-transform ${sidebarCollapsed ? 'w-[76px] px-[10px]' : 'w-[248px] px-[15px] max-[1180px]:w-[222px]'} ${mobileNavOpen ? 'max-[760px]:translate-x-0' : 'max-[760px]:-translate-x-[105%]'}`} aria-label={t('navigation')}>
        <div className={`flex min-h-[42px] items-center gap-[11px] px-[9px] [&>div:nth-child(2)]:grid [&>div:nth-child(2)]:gap-px [&_strong]:text-[19px] [&_strong]:font-extrabold [&_strong]:leading-[1.05] [&_strong]:text-[#284b35] [&_small]:text-[10px] [&_small]:font-semibold [&_small]:uppercase [&_small]:tracking-[1.1px] [&_small]:text-[#89958d] ${sidebarCollapsed ? 'min-[761px]:flex-col min-[761px]:gap-[9px] min-[761px]:px-0 [&>div:nth-child(2)]:min-[761px]:hidden' : ''}`}>
          <div className="relative flex size-[30px] shrink-0 items-center justify-center gap-0.5 overflow-hidden rounded-[9px_9px_9px_3px] bg-[#1f6041] [transform:rotate(-5deg)] [&>span]:h-[13px] [&>span]:w-1 [&>span]:rounded-full [&>span]:bg-[#f7d58a] [&>span]:[transform:rotate(24deg)] [&>span:nth-child(2)]:h-[18px] [&>span:nth-child(2)]:bg-[#fff2d2] [&>span:nth-child(3)]:h-[11px] [&>span:nth-child(3)]:bg-[#e97a50]" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>elbaraka</strong><small>{t('brandSubtitle')}</small></div>
          <Button
            className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-[#829087] transition-colors hover:border-[#e2ece3] hover:bg-[#f0f5f0] hover:text-[#1f6041] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b2b]/50 max-[760px]:hidden"
            aria-label={t(sidebarCollapsed ? 'expandSidebar' : 'collapseSidebar')}
            aria-expanded={!sidebarCollapsed}
            aria-controls="primary-navigation"
            title={t(sidebarCollapsed ? 'expandSidebar' : 'collapseSidebar')}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </Button>
          <Button className="hidden ml-auto size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-[#829087] transition-colors hover:border-[#e2ece3] hover:bg-[#f0f5f0] hover:text-[#1f6041] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b2b]/50 max-[760px]:inline-grid" aria-label={t('close')} onClick={() => setMobileNavOpen(false)}><X size={18} /></Button>
        </div>

        <div className={`my-[30px] mb-[28px] flex items-center gap-2.5 rounded-md border border-[#e8eee8] bg-[#f0f4f0] px-2.5 py-[11px] [&>div:last-child]:grid [&>div:last-child]:min-w-0 [&>div:last-child]:gap-[3px] [&_strong]:overflow-hidden [&_strong]:text-xs [&_strong]:font-bold [&_strong]:text-foreground [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:text-[11px] [&_small]:text-[#89958d] ${sidebarCollapsed ? 'min-[761px]:my-[18px] min-[761px]:mb-[15px] min-[761px]:justify-center min-[761px]:p-[7px] [&>div:last-child]:min-[761px]:hidden' : ''}`}>
          <div className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-[#d18a39] font-extrabold text-white">E</div>
          <div><strong>{t('workspaceName')}</strong><small>{t('workspaceMain')}</small></div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-color:#cbd6cd_transparent] [scrollbar-width:thin]">
          <p className={`mx-2.5 mb-2 text-[10px] font-bold uppercase tracking-[.7px] text-[#89958d] ${sidebarCollapsed ? 'min-[761px]:hidden' : ''}`}>{t('navigation')}</p>
          <nav className="grid gap-1">
            {visibleNavigation.map((item) => {
              const Icon = item.icon;
              const label = t(PAGE_LABEL_KEYS[item.id] as TranslationKey);
              return (
                <Button
                  key={item.id}
                  className={`relative flex min-h-[42px] w-full items-center gap-[11px] rounded-md border-0 bg-transparent px-[11px] text-[13px] text-[#627169] transition-colors hover:bg-[#f0f4f0] hover:text-[#244d39] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b2b]/50 ${page === item.id ? 'bg-[#e9f1ea] text-[#1f6041] hover:bg-[#e9f1ea] hover:text-[#1f6041] [&_svg]:text-[#1f6041]' : ''} ${sidebarCollapsed ? 'min-[761px]:justify-center min-[761px]:px-0' : ''}`}
                  onClick={() => navigate(item.id)}
                  aria-label={label}
                  title={label}
                  aria-current={page === item.id ? 'page' : undefined}
                >
                  <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                  {item.id === 'orders' && data.orders.some((order) => order.status === 'confirmed') && <i className={`absolute right-2 top-1/2 min-w-4 -translate-y-1/2 rounded-full bg-[#f3e8ca] px-1 text-center text-[9px] font-bold text-[#795a20] ${sidebarCollapsed ? 'min-[761px]:right-[2px] min-[761px]:top-[2px] min-[761px]:h-4 min-[761px]:min-w-4 min-[761px]:-translate-y-0 min-[761px]:px-[3px] min-[761px]:text-[8px]' : ''}`}>{data.orders.filter((order) => order.status === 'confirmed').length}</i>}
                </Button>
              );
            })}
          </nav>
        </div>

        <div className={`grid gap-3 ${sidebarCollapsed ? 'min-[761px]:gap-[10px]' : ''}`}>
          <div className={`flex items-center gap-2.5 rounded-md bg-[#f0f4f0] p-2.5 [&>div:last-child]:grid [&>div:last-child]:gap-[3px] [&_strong]:text-[11px] [&_strong]:font-bold [&_small]:text-[10px] [&_small]:text-[#89958d] ${sidebarCollapsed ? 'min-[761px]:justify-center min-[761px]:px-0 [&>div:last-child]:min-[761px]:hidden' : ''}`}>
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-white text-sm font-bold text-[#1f6041]">?</div>
            <div><strong>{t('needHelp')}</strong><small>{t('operationsGuide')}</small></div>
          </div>
          <div className={`relative flex items-center gap-2.5 border-t border-[#e3e9e3] px-1 pt-3 [&>div:nth-child(2)]:grid [&>div:nth-child(2)]:min-w-0 [&>div:nth-child(2)]:gap-[3px] [&_strong]:overflow-hidden [&_strong]:text-xs [&_strong]:font-bold [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:text-[11px] [&_small]:text-[#89958d] ${sidebarCollapsed ? 'min-[761px]:justify-center min-[761px]:px-0 [&>div:nth-child(2)]:min-[761px]:hidden [&>span]:min-[761px]:hidden' : ''}`}>
            <div className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-[#d18a39] font-extrabold text-white">A</div>
            <div><strong>{fullName || t(ROLE_LABEL_KEYS[role] as TranslationKey)}</strong><small>{authenticatedRole ? t(ROLE_LABEL_KEYS[role] as TranslationKey) : t('localWorkspace')}</small></div>
            <span className="absolute bottom-0 left-6 size-2 rounded-full border-2 border-[#fbfcfa] bg-[#5e9b6e]" aria-label={t('previewWorkspace')} />
          </div>
        </div>
      </aside>

      {mobileNavOpen && <Button className="fixed inset-0 z-[30] block h-full w-full rounded-none border-0 bg-[rgb(17_32_24_/_30%)] p-0 hover:bg-[rgb(17_32_24_/_30%)] max-[760px]:block min-[761px]:hidden" aria-label={t('close')} onClick={() => setMobileNavOpen(false)} />}

      <main className={`${sidebarCollapsed ? 'ml-[76px] max-[760px]:ml-0' : 'ml-[248px] max-[1180px]:ml-[222px] max-[760px]:ml-0'} min-h-screen transition-[margin] duration-200`}>
        <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between gap-5 border-b border-[#e1e7e1] bg-[#fbfcfa]/95 px-[38px] backdrop-blur max-[1180px]:px-[25px] max-[760px]:h-[54px] max-[760px]:justify-start max-[760px]:gap-2 max-[760px]:px-[18px]">
          <Button className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-[#829087] transition-colors hover:border-[#e2ece3] hover:bg-[#f0f5f0] hover:text-[#1f6041] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b2b]/50 hidden max-[760px]:inline-grid" aria-label={t('openMenu')} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><Menu size={20} /></Button>
          <div className="flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap text-xs text-[#87938b] [&>strong]:overflow-hidden [&>strong]:text-ellipsis [&>strong]:font-semibold [&>strong]:text-[#344b3e] max-[760px]:gap-[7px] max-[760px]:text-[10px] max-[760px]:[&>span:first-child]:hidden"><span>{t('workspaceName')}</span><span className="text-[#bbc4bd] max-[760px]:hidden">/</span><strong>{pageTitle}</strong></div>
          {authenticatedRole
            ? <span className="flex items-center gap-2 text-xs text-[#68766e] ">{t(ROLE_LABEL_KEYS[role] as TranslationKey)}</span>
            : <label className="flex items-center gap-2 text-xs text-[#68766e] "><span>{t('previewRole')}</span><Select value={role} onValueChange={(value) => changeRole(value as WorkspaceRole)}><SelectTrigger className="min-w-[136px]"><SelectValue /></SelectTrigger><SelectContent>{(['manager', 'purchasing', 'delivery'] as WorkspaceRole[]).map((value) => <SelectItem key={value} value={value}>{t(ROLE_LABEL_KEYS[value] as TranslationKey)}</SelectItem>)}</SelectContent></Select></label>}
          <div className="flex items-center gap-1 rounded-md border border-[#e1e7e1] bg-white p-1 [&_button]:min-h-7 [&_button]:min-w-8 [&_button]:rounded [&_button]:px-2 [&_button]:text-[10px] [&_button]:font-bold [&_button]:text-[#68766e] [&_button]:hover:bg-[#f0f4f0]" role="group" aria-label={t('language')}><Button className={locale === 'en' ? 'bg-[#e9f1ea] text-[#1f6041] hover:bg-[#e9f1ea]' : ''} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}>EN</Button><Button className={locale === 'ar' ? 'bg-[#e9f1ea] text-[#1f6041] hover:bg-[#e9f1ea]' : ''} onClick={() => setLocale('ar')} aria-pressed={locale === 'ar'}>ع</Button></div>
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap text-[10px] text-[#7d8b82] max-[760px]:text-[0px]"><span className="size-2 rounded-full bg-[#5e9b6e]" /> {t(authenticatedRole ? 'liveMasterData' : 'previewWorkspace')}</div>
        </header>

        <div className="mx-auto w-full max-w-[1440px] px-[38px] pb-[58px] pt-[23px] animate-[workspace-enter_260ms_ease-out_both] max-[1180px]:px-[25px] max-[760px]:px-4 max-[760px]:pb-[38px] max-[760px]:pt-[14px]">
          <div className="flex min-h-[38px] items-center gap-[9px] rounded-md border border-[#dce8dd] bg-[#e9f0e9] px-3 py-2 text-[11px] leading-[1.45] text-[#586c62] [&_svg]:shrink-0 [&_svg]:text-[#1f6041] [&_strong]:font-extrabold [&_strong]:text-[#284b35] max-[760px]:items-start max-[760px]:text-[10px]" role="note">
            <Activity size={16} />
            <span><strong>{t(authenticatedRole ? 'liveDataTitle' : 'previewTitle')}</strong> {t(authenticatedRole ? 'liveDataNotice' : 'previewNotice')}</span>
          </div>
          <div className="mt-[31px] mb-[25px] flex items-end justify-between gap-5 max-[760px]:[margin:24px_0_19px] max-[760px]:items-start">
            <div>
              <p className="mb-[7px] text-[11px] text-[#89958e] [&>span]:px-[5px] [&>span]:text-[#bbc4bd]">{t('operations')} <span>/</span> {pageTitle}</p>
              <h1 className="m-0 text-[clamp(25px,2.2vw,31px)] font-bold leading-[1.15] tracking-[-.6px] text-[#243a2d]">{pageTitle}</h1>
              <p className="mt-2 max-w-[480px] text-[13px] leading-[1.55] text-[#7f8b83] max-[760px]:text-[11px]">{pageSubtitle}</p>
            </div>
            <div className="flex items-center gap-3 max-[520px]:hidden">
              {page === 'overview' && role === 'manager' && <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" onClick={() => navigate('catalog')}><Plus size={17} /> {t('addItem')}</Button>}
              {page === 'catalog' && <span className="text-xs text-[#7f8b83]">{data.items.filter((item) => item.active).length} {t('activeItems')}</span>}
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

      {notice && <div className="fixed bottom-[22px] right-[22px] z-[150] max-w-[min(390px,calc(100vw-36px))] rounded-[7px] border border-[#387052] bg-[#244d39] px-[15px] py-3 text-[11px] leading-[1.45] text-white shadow-[0_8px_24px_rgb(24_45_36_/_20%)]" role="status">{notice}</div>}
    </div>
    </LocaleProvider>
  );
}

function RecipeWorkspace({ items }: { items: CatalogItem[] }) {
  const recipeOutputs = items.filter((item) => item.active && ['blend', 'finished_good'].includes(item.type));

  return (
    <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] max-w-[1080px] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
      <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]">
        <div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">Formulation</p><h2>Blend and pack components</h2></div>
        <span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold bg-[#eff3ef] text-[#63746a]">Preview formulas</span>
      </div>
      <p className="mb-4 mt-[-4px] max-w-[640px] text-[11px] leading-[1.55] text-[#7d8b82]">A blend is built from ingredients measured in grams. Finished goods can include a spice component and packaging counted by each.</p>
      <div className="border-t border-[#dfe5df]">
        {recipeOutputs.map((output) => (
          <article className="grid min-h-[70px] grid-cols-[8px_minmax(170px,.8fr)_minmax(220px,1.4fr)_auto] items-center gap-[13px] border-b border-[#edf0ed] max-[920px]:grid-cols-[7px_minmax(150px,.8fr)_minmax(180px,1.2fr)] max-[920px]:gap-[9px] max-[920px]:py-[10px] max-[760px]:grid-cols-[7px_minmax(0,1fr)] max-[760px]:gap-x-[10px] max-[760px]:gap-y-2 max-[760px]:py-[13px] [&>.status]:max-[920px]:col-[2/-1] [&>.status]:max-[920px]:justify-self-start [&>.recipe-components]:max-[760px]:col-start-2" key={output.id}>
            <div className={`block h-[31px] w-2 shrink-0 rounded-[3px] ${itemMarkerClass(output.type)}`} aria-hidden="true" />
            <div className="grid gap-1 [&_strong]:text-[11px] [&_strong]:text-[#42564a] [&_span]:font-mono [&_span]:text-[10px] [&_span]:text-[#89958d]"><strong>{output.name}</strong><span>{output.sku} · {output.type === 'blend' ? `Batch output ${formatStock(output.recipeOutputQuantity ?? 0, 'g')}` : `${output.netWeightG} g per each`}</span></div>
            <div className="flex flex-wrap gap-[6px] max-[760px]:col-start-2">
              {output.components.length ? output.components.map((component) => {
                const input = items.find((item) => item.id === component.itemId);
                if (!input) return null;
                return <span className="rounded-full border border-[#e5ebe5] bg-[#f7f9f7] px-2 py-1 text-[9px] text-[#65736a]" key={`${output.id}-${component.itemId}`}>{formatStock(component.quantity, input.baseUnit)} {input.name}</span>;
              }) : <span className="text-[9px] text-[#a07831]">No formula components entered</span>}
            </div>
            <span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold ${output.components.length ? 'bg-[#eaf4ed] text-[#35734f]' : 'bg-[#fbf2df] text-[#8a651d]'}`}>{output.components.length ? 'Formula entered' : 'Needs formula'}</span>
          </article>
        ))}
        {recipeOutputs.length === 0 && <p className="my-5 mb-1 text-xs text-[#7f8b83]">Add a blend or finished good to begin recording formulas.</p>}
      </div>
      <p className="mb-0 mt-[14px] text-[9px] text-[#9aa49d]">Formula approval and immutable versions will be enforced by the production database, not this preview.</p>
    </section>
  );
}