export type ItemType = 'raw_material' | 'blend' | 'packaging' | 'finished_good';
export type StockUnit = 'g' | 'each';
export type WorkspaceRole = 'manager' | 'purchasing' | 'delivery';
export type WorkspacePage =
  | 'overview'
  | 'catalog'
  | 'inventory'
  | 'recipes'
  | 'purchasing'
  | 'production'
  | 'clients'
  | 'orders'
  | 'deliveries'
  | 'map'
  | 'invoices'
  | 'returns'
  | 'access';

export type RoleAccess = Record<WorkspaceRole, WorkspacePage[]>;

export type RecipeComponent = {
  itemId: string;
  quantity: number;
};

export type CatalogItem = {
  id: string;
  sku: string;
  name: string;
  type: ItemType;
  baseUnit: StockUnit;
  stockOnHand: number;
  quarantinedStock: number;
  reorderPoint: number;
  netWeightG: number | null;
  recipeOutputQuantity: number | null;
  salePriceMad: number;
  trackLots: boolean;
  active: boolean;
  components: RecipeComponent[];
};

export type ClientAccount = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  active: boolean;
};

export type Supplier = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  leadTimeDays: number;
  active: boolean;
};

export type OrderLine = {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMad: number;
};

export type SalesOrder = {
  id: string;
  number: string;
  clientId: string;
  customer: string;
  createdAt: string;
  status: 'confirmed' | 'delivered';
  lines: OrderLine[];
};

export type DeliveryNote = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  clientId: string;
  customer: string;
  createdAt: string;
  lines: OrderLine[];
};

export type PurchaseOrderLine = {
  itemId: string;
  quantity: number;
  receivedQuantity: number;
  unitCostMad: number;
};

export type PurchaseOrder = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  createdAt: string;
  status: 'draft' | 'ordered' | 'part_received' | 'received';
  lines: PurchaseOrderLine[];
};

export type ProductionOrder = {
  id: string;
  number: string;
  itemId: string;
  targetQuantity: number;
  createdAt: string;
  status: 'planned' | 'in_progress' | 'completed';
};

export type InventoryMovement = {
  id: string;
  itemId: string;
  quantityDelta: number;
  kind: 'purchase_receipt' | 'production_output' | 'production_use' | 'shipment' | 'customer_return' | 'return_release' | 'return_rejected';
  reference: string;
  createdAt: string;
};

export type SalesInvoice = {
  id: string;
  number: string;
  deliveryNoteId: string;
  deliveryNumber: string;
  clientId: string;
  customer: string;
  issuedAt: string;
  amountMad: number;
  paidMad: number;
};

export type CustomerReturn = {
  id: string;
  number: string;
  deliveryNoteId: string;
  deliveryNumber: string;
  clientId: string;
  customer: string;
  createdAt: string;
  reason: string;
  status: 'requested' | 'inspection' | 'released' | 'rejected';
  lines: { itemId: string; quantity: number }[];
};

export type WorkspaceData = {
  items: CatalogItem[];
  clients: ClientAccount[];
  suppliers: Supplier[];
  orders: SalesOrder[];
  deliveryNotes: DeliveryNote[];
  purchaseOrders: PurchaseOrder[];
  productionOrders: ProductionOrder[];
  movements: InventoryMovement[];
  invoices: SalesInvoice[];
  returns: CustomerReturn[];
  roleAccess: RoleAccess;
};

export const CATALOG_SUBPAGES = ['products', 'categories', 'stock'] as const;
export type CatalogSubpage = (typeof CATALOG_SUBPAGES)[number];

export function workspacePath(page: WorkspacePage, subpage?: string) {
  if (page === 'overview') return '/staff';
  return subpage ? `/staff/${page}/${subpage}` : `/staff/${page}`;
}

const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function productPath(productId: string) {
  return `/staff/catalog/products/${productId}`;
}

export function clientPath(clientId: string) {
  return `/staff/clients/${clientId}`;
}

export function parseWorkspacePath(pathname: string): { page: WorkspacePage; subpage: string | null; detailId: string | null } | null {
  const [root, pageSegment, subSegment, detailSegment, ...rest] = pathname.split('/').filter(Boolean);
  if (root !== 'staff' || rest.length > 0) return null;
  if (!pageSegment) return subSegment ? null : { page: 'overview', subpage: null, detailId: null };
  const page = WORKSPACE_PAGES.find((candidate) => candidate === pageSegment);
  if (!page || page === 'overview') return null;
  if (page === 'clients' && subSegment && PRODUCT_ID_PATTERN.test(subSegment) && !detailSegment) {
    return { page, subpage: null, detailId: subSegment };
  }
  if (subSegment && !(page === 'catalog' && (CATALOG_SUBPAGES as readonly string[]).includes(subSegment))) return null;
  if (detailSegment && !(subSegment === 'products' && PRODUCT_ID_PATTERN.test(detailSegment))) return null;
  return { page, subpage: subSegment ?? null, detailId: detailSegment ?? null };
}

export const WORKSPACE_STORAGE_KEY = 'elbaraka-operations-preview-v2';

export const INITIAL_ROLE_ACCESS: RoleAccess = {
  manager: ['overview', 'catalog', 'inventory', 'recipes', 'purchasing', 'production', 'clients', 'orders', 'deliveries', 'map', 'invoices', 'returns', 'access'],
  purchasing: ['overview', 'catalog', 'inventory', 'recipes', 'purchasing', 'production', 'clients'],
  delivery: ['overview', 'inventory', 'orders', 'deliveries', 'map', 'returns'],
};

const baseItem = (item: Omit<CatalogItem, 'quarantinedStock' | 'salePriceMad'> & Partial<Pick<CatalogItem, 'quarantinedStock' | 'salePriceMad'>>): CatalogItem => ({
  ...item,
  quarantinedStock: item.quarantinedStock ?? 0,
  salePriceMad: item.salePriceMad ?? 0,
});

export const INITIAL_WORKSPACE: WorkspaceData = {
  items: [
    baseItem({ id: 'item-cumin', sku: 'RM-CUM-001', name: 'Cumin seeds', type: 'raw_material', baseUnit: 'g', stockOnHand: 428000, reorderPoint: 80000, netWeightG: null, recipeOutputQuantity: null, trackLots: true, active: true, components: [] }),
    baseItem({ id: 'item-turmeric', sku: 'RM-TUR-002', name: 'Turmeric powder', type: 'raw_material', baseUnit: 'g', stockOnHand: 186000, reorderPoint: 50000, netWeightG: null, recipeOutputQuantity: null, trackLots: true, active: true, components: [] }),
    baseItem({ id: 'item-pepper', sku: 'RM-BPE-003', name: 'Black pepper', type: 'raw_material', baseUnit: 'g', stockOnHand: 74000, reorderPoint: 90000, netWeightG: null, recipeOutputQuantity: null, trackLots: true, active: true, components: [] }),
    baseItem({ id: 'item-paprika', sku: 'RM-PAP-004', name: 'Sweet paprika', type: 'raw_material', baseUnit: 'g', stockOnHand: 255000, reorderPoint: 70000, netWeightG: null, recipeOutputQuantity: null, trackLots: true, active: true, components: [] }),
    baseItem({ id: 'item-baharat', sku: 'BL-BAH-001', name: 'House baharat', type: 'blend', baseUnit: 'g', stockOnHand: 38200, reorderPoint: 12000, netWeightG: null, recipeOutputQuantity: 1000, trackLots: true, active: true, components: [{ itemId: 'item-cumin', quantity: 400 }, { itemId: 'item-pepper', quantity: 200 }, { itemId: 'item-paprika', quantity: 400 }] }),
    baseItem({ id: 'item-ras-el-hanout', sku: 'BL-REH-002', name: 'Ras el hanout', type: 'blend', baseUnit: 'g', stockOnHand: 17600, reorderPoint: 8000, netWeightG: null, recipeOutputQuantity: 1000, trackLots: true, active: true, components: [{ itemId: 'item-cumin', quantity: 300 }, { itemId: 'item-turmeric', quantity: 250 }, { itemId: 'item-paprika', quantity: 450 }] }),
    baseItem({ id: 'item-jar', sku: 'PK-JAR-050', name: 'Glass jar, 50 g', type: 'packaging', baseUnit: 'each', stockOnHand: 1640, reorderPoint: 500, netWeightG: null, recipeOutputQuantity: null, trackLots: false, active: true, components: [] }),
    baseItem({ id: 'item-label', sku: 'PK-LBL-050', name: 'Front label, 50 g', type: 'packaging', baseUnit: 'each', stockOnHand: 380, reorderPoint: 600, netWeightG: null, recipeOutputQuantity: null, trackLots: false, active: true, components: [] }),
    baseItem({ id: 'item-baharat-50', sku: 'FG-BAH-050', name: 'House baharat, 50 g jar', type: 'finished_good', baseUnit: 'each', stockOnHand: 94, reorderPoint: 36, netWeightG: 50, recipeOutputQuantity: 1, salePriceMad: 18, trackLots: true, active: true, components: [{ itemId: 'item-baharat', quantity: 50 }, { itemId: 'item-jar', quantity: 1 }, { itemId: 'item-label', quantity: 1 }] }),
    baseItem({ id: 'item-cumin-100', sku: 'FG-CUM-100', name: 'Ground cumin, 100 g pouch', type: 'finished_good', baseUnit: 'each', stockOnHand: 27, reorderPoint: 30, netWeightG: 100, recipeOutputQuantity: 1, salePriceMad: 22, trackLots: true, active: true, components: [{ itemId: 'item-cumin', quantity: 100 }] }),
    baseItem({ id: 'item-paprika-50', sku: 'FG-PAP-050', name: 'Sweet paprika, 50 g jar', type: 'finished_good', baseUnit: 'each', stockOnHand: 128, reorderPoint: 36, netWeightG: 50, recipeOutputQuantity: 1, salePriceMad: 16, trackLots: true, active: true, components: [{ itemId: 'item-paprika', quantity: 50 }, { itemId: 'item-jar', quantity: 1 }, { itemId: 'item-label', quantity: 1 }] }),
    baseItem({ id: 'item-turmeric-50', sku: 'FG-TUR-050', name: 'Turmeric, 50 g jar', type: 'finished_good', baseUnit: 'each', stockOnHand: 73, reorderPoint: 36, netWeightG: 50, recipeOutputQuantity: 1, salePriceMad: 15, trackLots: true, active: true, components: [{ itemId: 'item-turmeric', quantity: 50 }, { itemId: 'item-jar', quantity: 1 }, { itemId: 'item-label', quantity: 1 }] }),
  ],
  clients: [
    { id: 'client-atlas', name: 'Atlas Market', contactName: 'Youssef Amrani', phone: '+212 6 11 22 33 44', address: '12 Avenue Hassan II', city: 'Casablanca', active: true },
    { id: 'client-corner', name: 'Corner Pantry', contactName: 'Salma Idrissi', phone: '+212 6 22 33 44 55', address: '4 Rue des Fleurs', city: 'Rabat', active: true },
    { id: 'client-medina', name: 'Medina Épicerie', contactName: 'Omar Benali', phone: '+212 6 33 44 55 66', address: '8 Derb Sidi Ahmed', city: 'Marrakech', active: true },
  ],
  suppliers: [
    { id: 'supplier-atlas', name: 'Atlas Agro Trading', contactName: 'Karim El Fassi', phone: '+212 5 22 44 66 88', leadTimeDays: 7, active: true },
    { id: 'supplier-souss', name: 'Souss Spice Cooperative', contactName: 'Amina Tazi', phone: '+212 5 28 33 41 22', leadTimeDays: 12, active: true },
    { id: 'supplier-pack', name: 'Pack Maroc', contactName: 'Nadia Alaoui', phone: '+212 5 22 55 11 90', leadTimeDays: 5, active: true },
  ],
  orders: [
    { id: 'order-1048', number: 'SO-1048', clientId: 'client-atlas', customer: 'Atlas Market', createdAt: '2026-10-21T09:12:00.000Z', status: 'confirmed', lines: [{ itemId: 'item-baharat-50', sku: 'FG-BAH-050', name: 'House baharat, 50 g jar', quantity: 24, unitPriceMad: 18 }, { itemId: 'item-paprika-50', sku: 'FG-PAP-050', name: 'Sweet paprika, 50 g jar', quantity: 12, unitPriceMad: 16 }] },
    { id: 'order-1047', number: 'SO-1047', clientId: 'client-corner', customer: 'Corner Pantry', createdAt: '2026-10-20T14:40:00.000Z', status: 'delivered', lines: [{ itemId: 'item-cumin-100', sku: 'FG-CUM-100', name: 'Ground cumin, 100 g pouch', quantity: 10, unitPriceMad: 22 }] },
  ],
  deliveryNotes: [
    { id: 'delivery-1047', number: 'DN-1047', orderId: 'order-1047', orderNumber: 'SO-1047', clientId: 'client-corner', customer: 'Corner Pantry', createdAt: '2026-10-20T16:00:00.000Z', lines: [{ itemId: 'item-cumin-100', sku: 'FG-CUM-100', name: 'Ground cumin, 100 g pouch', quantity: 10, unitPriceMad: 22 }] },
  ],
  purchaseOrders: [
    { id: 'purchase-203', number: 'PO-0203', supplierId: 'supplier-atlas', supplierName: 'Atlas Agro Trading', createdAt: '2026-10-20T10:00:00.000Z', status: 'ordered', lines: [{ itemId: 'item-pepper', quantity: 100000, receivedQuantity: 0, unitCostMad: 0.085 }] },
  ],
  productionOrders: [
    { id: 'production-57', number: 'MO-0057', itemId: 'item-baharat-50', targetQuantity: 48, createdAt: '2026-10-21T08:30:00.000Z', status: 'planned' },
  ],
  movements: [],
  invoices: [
    { id: 'invoice-1047', number: 'FAC-2026-0047', deliveryNoteId: 'delivery-1047', deliveryNumber: 'DN-1047', clientId: 'client-corner', customer: 'Corner Pantry', issuedAt: '2026-10-20T16:15:00.000Z', amountMad: 220, paidMad: 0 },
  ],
  returns: [],
  roleAccess: INITIAL_ROLE_ACCESS,
};

export const WORKSPACE_PAGES: WorkspacePage[] = [
  'overview', 'catalog', 'inventory', 'recipes', 'purchasing', 'production',
  'clients', 'orders', 'deliveries', 'map', 'invoices', 'returns', 'access',
];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  raw_material: 'Raw material',
  blend: 'Spice blend',
  packaging: 'Packaging',
  finished_good: 'Finished good',
};

export function formatStock(quantity: number, unit: StockUnit, locale = 'en-MA'): string {
  const displayQuantity = unit === 'g' && quantity >= 1000 ? quantity / 1000 : quantity;
  const displayUnit = unit === 'g' && quantity >= 1000 ? 'kg' : unit === 'each' ? 'ea' : 'g';
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 'g' && quantity >= 1000 ? 1 : 0 }).format(displayQuantity);
  return `${formatted} ${displayUnit}`;
}

export function formatMad(amount: number, locale: 'en' | 'ar' = 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-MA' : 'en-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function migrateWorkspace(value: unknown): WorkspaceData {
  if (typeof value !== 'object' || value === null) return INITIAL_WORKSPACE;
  const saved = value as Partial<WorkspaceData>;
  const savedItems = Array.isArray(saved.items) ? saved.items : INITIAL_WORKSPACE.items;
  const items = savedItems.map((item) => ({
    ...item,
    quarantinedStock: item.quarantinedStock ?? 0,
    salePriceMad: item.salePriceMad ?? 0,
  }));
  const savedOrders = Array.isArray(saved.orders) ? saved.orders : INITIAL_WORKSPACE.orders;
  const orders = savedOrders.map((order) => ({
    ...order,
    clientId: order.clientId ?? '',
    lines: order.lines.map((line) => ({ ...line, unitPriceMad: line.unitPriceMad ?? 0 })),
  }));

  return {
    ...INITIAL_WORKSPACE,
    ...saved,
    items,
    orders,
    clients: Array.isArray(saved.clients) ? saved.clients : INITIAL_WORKSPACE.clients,
    suppliers: Array.isArray(saved.suppliers) ? saved.suppliers : INITIAL_WORKSPACE.suppliers,
    deliveryNotes: Array.isArray(saved.deliveryNotes) ? saved.deliveryNotes.map((note) => ({ ...note, orderId: note.orderId ?? '', clientId: note.clientId ?? '', lines: note.lines.map((line) => ({ ...line, unitPriceMad: line.unitPriceMad ?? 0 })) })) : INITIAL_WORKSPACE.deliveryNotes,
    purchaseOrders: Array.isArray(saved.purchaseOrders) ? saved.purchaseOrders : INITIAL_WORKSPACE.purchaseOrders,
    productionOrders: Array.isArray(saved.productionOrders) ? saved.productionOrders : INITIAL_WORKSPACE.productionOrders,
    movements: Array.isArray(saved.movements) ? saved.movements : [],
    invoices: Array.isArray(saved.invoices) ? saved.invoices : INITIAL_WORKSPACE.invoices,
    returns: Array.isArray(saved.returns) ? saved.returns : [],
    roleAccess: saved.roleAccess
      ? {
        ...saved.roleAccess,
        manager: saved.roleAccess.manager.includes('map') ? saved.roleAccess.manager : [...saved.roleAccess.manager, 'map'],
        delivery: saved.roleAccess.delivery.includes('map') ? saved.roleAccess.delivery : [...saved.roleAccess.delivery, 'map'],
      }
      : INITIAL_ROLE_ACCESS,
  };
}