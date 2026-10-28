import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROW_LIMIT = 20000;
const RANGES = new Set(['30', '90', '365', 'all']);

type Rel<T> = T | T[] | null;
type OrderLineRow = {
  item_id: string;
  quantity: number;
  unit_price_mad: number | string;
  created_at: string;
  order: Rel<{ id: string; document_number: string; status: string; client_id: string; client_name_snapshot: string; created_at: string }>;
};
type DeliveryLineRow = {
  item_id: string;
  quantity: number;
  unit_price_mad: number | string;
  note: Rel<{ id: string; document_number: string; status: string; client_id: string; client_name_snapshot: string; delivered_at: string | null; created_at: string }>;
};
type ReturnLineRow = {
  item_id: string;
  quantity: number;
  ret: Rel<{ id: string; document_number: string; status: string; reason: string; client_name_snapshot: string; created_at: string }>;
};

function one<T>(value: Rel<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'This account has no active staff access.' }, { status: 403 });
  return NextResponse.json({ error: 'Product analytics service is unavailable.' }, { status: 503 });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

    const rangeParam = request.nextUrl.searchParams.get('range') ?? '90';
    const range = RANGES.has(rangeParam) ? rangeParam : '90';
    const since = range === 'all' ? null : new Date(Date.now() - Number(range) * 86400000).toISOString();

    const supabase = await getSupabaseServerClient();
    const workspaceId = identity.workspaceId;

    const [productResult, sizesResult] = await Promise.all([
      supabase.from('erp_products')
        .select('id, category_id, name_ar, name, stock_unit, is_active, created_at, updated_at')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle(),
      supabase.from('erp_product_sizes')
        .select('id, size_g, sku, sale_price_mad, inventory_item_id, is_active, created_at')
        .eq('workspace_id', workspaceId).eq('product_id', id).order('size_g'),
    ]);
    if (productResult.error || sizesResult.error) return NextResponse.json({ error: 'Could not load product.' }, { status: 503 });
    if (!productResult.data) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

    const product = productResult.data;
    const sizes = sizesResult.data ?? [];
    const { data: category } = product.category_id
      ? await supabase.from('erp_product_categories').select('id, name_ar, name').eq('workspace_id', workspaceId).eq('id', product.category_id).maybeSingle()
      : { data: null };

    const itemIds = sizes.map((size) => size.inventory_item_id).filter((value): value is string => Boolean(value));
    const sizeByItem = new Map(sizes.filter((size) => size.inventory_item_id).map((size) => [size.inventory_item_id as string, size]));
    const base = { product, category, sizes, range, truncated: false };
    if (itemIds.length === 0) {
      return NextResponse.json({ ...base, linked: false }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    let ordersQuery = supabase.from('erp_sales_order_lines')
      .select('item_id, quantity, unit_price_mad, created_at, order:erp_sales_orders!inner(id, document_number, status, client_id, client_name_snapshot, created_at)')
      .eq('workspace_id', workspaceId).in('item_id', itemIds).order('created_at', { ascending: false }).limit(ROW_LIMIT);
    if (since) ordersQuery = ordersQuery.gte('created_at', since);

    let deliveryQuery = supabase.from('erp_delivery_note_lines')
      .select('item_id, quantity, unit_price_mad, note:erp_delivery_notes!inner(id, document_number, status, client_id, client_name_snapshot, delivered_at, created_at)')
      .eq('workspace_id', workspaceId).in('item_id', itemIds).limit(ROW_LIMIT);
    if (since) deliveryQuery = deliveryQuery.gte('created_at', since);

    let returnsQuery = supabase.from('erp_customer_return_lines')
      .select('item_id, quantity, ret:erp_customer_returns!inner(id, document_number, status, reason, client_name_snapshot, created_at)')
      .eq('workspace_id', workspaceId).in('item_id', itemIds).limit(ROW_LIMIT);
    if (since) returnsQuery = returnsQuery.gte('created_at', since);

    const [ordersResult, deliveryResult, returnsResult, movementsResult, productionResult] = await Promise.all([
      ordersQuery,
      deliveryQuery,
      returnsQuery,
      supabase.from('inventory_movements')
        .select('item_id, movement_type, quantity_delta, recorded_at, reference_type')
        .in('item_id', itemIds).order('recorded_at', { ascending: false }).limit(ROW_LIMIT),
      supabase.from('erp_production_orders')
        .select('id, document_number, output_item_id, target_quantity, actual_quantity, status, created_at')
        .eq('workspace_id', workspaceId).in('output_item_id', itemIds).order('created_at', { ascending: false }).limit(200),
    ]);
    if (ordersResult.error || deliveryResult.error || returnsResult.error || movementsResult.error || productionResult.error) {
      return NextResponse.json({ error: 'Could not load product analytics.' }, { status: 503 });
    }

    const orderLines = (ordersResult.data ?? []) as unknown as OrderLineRow[];
    const deliveryLines = (deliveryResult.data ?? []) as unknown as DeliveryLineRow[];
    const returnLines = (returnsResult.data ?? []) as unknown as ReturnLineRow[];
    const movements = movementsResult.data ?? [];
    const production = productionResult.data ?? [];
    const sizeGrams = (itemId: string) => Number(sizeByItem.get(itemId)?.size_g ?? 0);

    const statusBreakdown = new Map<string, { orders: Set<string>; units: number; revenue: number }>();
    const monthly = new Map<string, { month: string; units: number; revenue: number }>();
    const clients = new Map<string, { clientId: string; name: string; orders: Set<string>; units: number; revenue: number; lastOrderAt: string }>();
    const perSize = new Map<string, { sizeId: string; units: number; revenue: number; delivered: number; returned: number }>();
    const sizeRow = (itemId: string) => {
      const size = sizeByItem.get(itemId);
      const key = size?.id ?? itemId;
      if (!perSize.has(key)) perSize.set(key, { sizeId: key, units: 0, revenue: 0, delivered: 0, returned: 0 });
      return perSize.get(key)!;
    };

    const orderIds = new Set<string>();
    let orderedUnits = 0;
    let orderedRevenue = 0;
    let weightG = 0;
    let firstSaleAt: string | null = null;
    let lastSaleAt: string | null = null;
    const recentOrders: Array<{ id: string; documentNumber: string; status: string; client: string; quantity: number; unitPrice: number; total: number; createdAt: string }> = [];

    for (const line of orderLines) {
      const order = one(line.order);
      if (!order) continue;
      const price = Number(line.unit_price_mad);
      const total = line.quantity * price;
      const bucket = statusBreakdown.get(order.status) ?? { orders: new Set<string>(), units: 0, revenue: 0 };
      bucket.orders.add(order.id);
      bucket.units += line.quantity;
      bucket.revenue += total;
      statusBreakdown.set(order.status, bucket);
      if (recentOrders.length < 15) {
        recentOrders.push({ id: order.id, documentNumber: order.document_number, status: order.status, client: order.client_name_snapshot, quantity: line.quantity, unitPrice: price, total: round2(total), createdAt: order.created_at });
      }
      if (order.status === 'draft' || order.status === 'cancelled') continue;

      orderIds.add(order.id);
      orderedUnits += line.quantity;
      orderedRevenue += total;
      weightG += line.quantity * sizeGrams(line.item_id);
      if (!firstSaleAt || order.created_at < firstSaleAt) firstSaleAt = order.created_at;
      if (!lastSaleAt || order.created_at > lastSaleAt) lastSaleAt = order.created_at;

      const month = monthly.get(monthKey(order.created_at)) ?? { month: monthKey(order.created_at), units: 0, revenue: 0 };
      month.units += line.quantity;
      month.revenue += total;
      monthly.set(month.month, month);

      const client = clients.get(order.client_id) ?? { clientId: order.client_id, name: order.client_name_snapshot, orders: new Set<string>(), units: 0, revenue: 0, lastOrderAt: order.created_at };
      client.orders.add(order.id);
      client.units += line.quantity;
      client.revenue += total;
      if (order.created_at > client.lastOrderAt) client.lastOrderAt = order.created_at;
      clients.set(order.client_id, client);

      const row = sizeRow(line.item_id);
      row.units += line.quantity;
      row.revenue += total;
    }

    let deliveredUnits = 0;
    let deliveredRevenue = 0;
    let inTransitUnits = 0;
    for (const line of deliveryLines) {
      const note = one(line.note);
      if (!note) continue;
      if (note.status === 'delivered') {
        deliveredUnits += line.quantity;
        deliveredRevenue += line.quantity * Number(line.unit_price_mad);
        sizeRow(line.item_id).delivered += line.quantity;
      } else if (note.status === 'ready' || note.status === 'dispatched') {
        inTransitUnits += line.quantity;
      }
    }

    let returnedUnits = 0;
    let requestedReturnUnits = 0;
    const returnReasons = new Map<string, number>();
    const recentReturns: Array<{ id: string; documentNumber: string; status: string; client: string; quantity: number; reason: string; createdAt: string }> = [];
    for (const line of returnLines) {
      const ret = one(line.ret);
      if (!ret || ret.status === 'rejected') continue;
      if (recentReturns.length < 10) {
        recentReturns.push({ id: ret.id, documentNumber: ret.document_number, status: ret.status, client: ret.client_name_snapshot, quantity: line.quantity, reason: ret.reason, createdAt: ret.created_at });
      }
      if (ret.status === 'released') {
        returnedUnits += line.quantity;
        sizeRow(line.item_id).returned += line.quantity;
      } else {
        requestedReturnUnits += line.quantity;
      }
      returnReasons.set(ret.reason, (returnReasons.get(ret.reason) ?? 0) + line.quantity);
    }

    let stockOnHand = 0;
    let producedUnits = 0;
    let shippedUnits = 0;
    const stockPerItem = new Map<string, number>();
    for (const movement of movements) {
      const delta = Number(movement.quantity_delta);
      stockOnHand += delta;
      stockPerItem.set(movement.item_id, (stockPerItem.get(movement.item_id) ?? 0) + delta);
      if (movement.movement_type === 'production_output') producedUnits += delta;
      if (movement.movement_type === 'shipment') shippedUnits += -delta;
    }
    const recentMovements = movements.slice(0, 15).map((movement) => ({
      type: movement.movement_type,
      quantity: Number(movement.quantity_delta),
      recordedAt: movement.recorded_at,
      sku: sizeByItem.get(movement.item_id)?.sku ?? null,
    }));

    const days = since ? Number(range) : Math.max(1, Math.ceil((Date.now() - new Date(firstSaleAt ?? Date.now()).getTime()) / 86400000));
    const dailyRate = orderedUnits / days;
    const orderCount = orderIds.size;

    return NextResponse.json({
      ...base,
      linked: true,
      truncated: orderLines.length >= ROW_LIMIT || deliveryLines.length >= ROW_LIMIT,
      kpis: {
        orderCount,
        orderedUnits,
        orderedRevenue: round2(orderedRevenue),
        deliveredUnits,
        deliveredRevenue: round2(deliveredRevenue),
        inTransitUnits,
        returnedUnits,
        requestedReturnUnits,
        returnRate: deliveredUnits > 0 ? Math.round((returnedUnits / deliveredUnits) * 1000) / 10 : 0,
        averageOrderValue: orderCount > 0 ? round2(orderedRevenue / orderCount) : 0,
        averageUnitPrice: orderedUnits > 0 ? round2(orderedRevenue / orderedUnits) : 0,
        weightKg: Math.round(weightG / 10) / 100,
        uniqueClients: clients.size,
        firstSaleAt,
        lastSaleAt,
        dailyRate: Math.round(dailyRate * 100) / 100,
        stockOnHand,
        daysOfCover: dailyRate > 0 ? Math.round(stockOnHand / dailyRate) : null,
        producedUnits,
        shippedUnits,
      },
      monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)).map((row) => ({ ...row, revenue: round2(row.revenue) })),
      byStatus: [...statusBreakdown.entries()].map(([status, value]) => ({ status, orders: value.orders.size, units: value.units, revenue: round2(value.revenue) })),
      bySize: [...perSize.values()].map((row) => ({ ...row, revenue: round2(row.revenue), stock: stockPerItem.get(sizes.find((size) => size.id === row.sizeId)?.inventory_item_id ?? '') ?? 0 })),
      topClients: [...clients.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((client) => ({ clientId: client.clientId, name: client.name, orders: client.orders.size, units: client.units, revenue: round2(client.revenue), lastOrderAt: client.lastOrderAt })),
      returnReasons: [...returnReasons.entries()].map(([reason, units]) => ({ reason, units })).sort((a, b) => b.units - a.units).slice(0, 5),
      recentOrders,
      recentReturns,
      recentMovements,
      production: production.slice(0, 10).map((row) => ({ id: row.id, documentNumber: row.document_number, status: row.status, target: Number(row.target_quantity), actual: row.actual_quantity === null ? null : Number(row.actual_quantity), createdAt: row.created_at })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
