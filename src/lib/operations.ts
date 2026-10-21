import { CatalogItem, PurchaseOrder, SalesOrder, WorkspaceData } from './workspace';

export type StockRequirement = {
  item: CatalogItem;
  quantity: number;
  reasons: string[];
};

export function reservedQuantity(orders: SalesOrder[], itemId: string): number {
  return orders
    .filter((order) => order.status === 'confirmed')
    .flatMap((order) => order.lines)
    .filter((line) => line.itemId === itemId)
    .reduce((total, line) => total + line.quantity, 0);
}

export function availableQuantity(item: CatalogItem, orders: SalesOrder[]): number {
  return item.stockOnHand - reservedQuantity(orders, item.id);
}

export function calculateFinishedProductionNeeds(data: WorkspaceData): StockRequirement[] {
  return data.items
    .filter((item) => item.active && item.type === 'finished_good' && item.components.length > 0)
    .map((item) => ({
      item,
      quantity: Math.max(0, item.reorderPoint - availableQuantity(item, data.orders)),
      reasons: ['reorder'],
    }))
    .filter((need) => need.quantity > 0)
    .sort((left, right) => right.quantity - left.quantity);
}

export function calculateProductionRequirements(data: WorkspaceData): StockRequirement[] {
  const itemById = new Map(data.items.map((item) => [item.id, item]));
  const needs = new Map<string, StockRequirement>();

  const addNeed = (itemId: string, quantity: number, reason: string) => {
    const item = itemById.get(itemId);
    if (!item || quantity <= 0) return;
    const existing = needs.get(itemId);
    if (existing) {
      existing.quantity += quantity;
      existing.reasons.push(reason);
    } else {
      needs.set(itemId, { item, quantity, reasons: [reason] });
    }
  };

  const explode = (itemId: string, outputQuantity: number, scale: number, reason: string, ancestors: Set<string>) => {
    const item = itemById.get(itemId);
    if (!item || ancestors.has(itemId)) return;
    const nextAncestors = new Set(ancestors).add(itemId);
    if (item.components.length === 0 || !item.recipeOutputQuantity || item.recipeOutputQuantity <= 0) {
      addNeed(itemId, outputQuantity * scale, reason);
      return;
    }

    for (const component of item.components) {
      const componentItem = itemById.get(component.itemId);
      if (!componentItem) continue;
      const componentQuantity = component.quantity * (outputQuantity / item.recipeOutputQuantity) * scale;
      if (componentItem.type === 'blend' && componentItem.components.length > 0) {
        explode(componentItem.id, componentQuantity, 1, reason, nextAncestors);
      } else {
        addNeed(componentItem.id, componentQuantity, reason);
      }
    }
  };

  const finishedGoods = data.items.filter((item) => item.active && item.type === 'finished_good');
  for (const finishedGood of finishedGoods) {
    const available = availableQuantity(finishedGood, data.orders);
    const belowReorder = Math.max(0, finishedGood.reorderPoint - available);
    const orderDemand = reservedQuantity(data.orders, finishedGood.id);
    const quantityToMake = Math.max(belowReorder, orderDemand);
    if (quantityToMake <= 0 || finishedGood.components.length === 0) continue;
    explode(finishedGood.id, quantityToMake, 1, finishedGood.name, new Set());
  }

  return Array.from(needs.values()).sort((left, right) => left.item.name.localeCompare(right.item.name));
}

export function calculatePurchaseNeeds(data: WorkspaceData): StockRequirement[] {
  const productionNeeds = calculateProductionRequirements(data);
  const productionByItem = new Map(productionNeeds.map((need) => [need.item.id, need]));
  const outstandingByItem = new Map<string, number>();
  for (const purchase of data.purchaseOrders) {
    if (purchase.status === 'received') continue;
    for (const line of purchase.lines) {
      const outstanding = Math.max(0, line.quantity - line.receivedQuantity);
      outstandingByItem.set(line.itemId, (outstandingByItem.get(line.itemId) ?? 0) + outstanding);
    }
  }

  return data.items
    .filter((item) => item.active && (item.type === 'raw_material' || item.type === 'packaging' || item.type === 'blend'))
    .map((item) => {
      const production = productionByItem.get(item.id);
      const available = item.stockOnHand;
      const outstanding = outstandingByItem.get(item.id) ?? 0;
      const productionShortage = Math.max(0, (production?.quantity ?? 0) - available - outstanding);
      const reorderShortage = Math.max(0, item.reorderPoint - available - outstanding);
      const quantity = Math.max(productionShortage, reorderShortage);
      const reasons: string[] = [];
      if (productionShortage > 0) reasons.push('production');
      if (reorderShortage > 0) reasons.push('reorder');
      return { item, quantity, reasons };
    })
    .filter((need) => need.quantity > 0)
    .sort((left, right) => right.quantity / Math.max(1, left.item.reorderPoint) - left.quantity / Math.max(1, right.item.reorderPoint));
}

export function getOpenPurchaseQuantity(purchaseOrders: PurchaseOrder[], itemId: string): number {
  return purchaseOrders
    .filter((purchase) => purchase.status !== 'received')
    .flatMap((purchase) => purchase.lines)
    .filter((line) => line.itemId === itemId)
    .reduce((sum, line) => sum + Math.max(0, line.quantity - line.receivedQuantity), 0);
}
