import { NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { casablancaToday } from '@/lib/delivery-map';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const EMPTY_COUNT = { count: 0, error: null };
const EMPTY_ROWS = { data: [], error: null };

type BalanceRow = {
  item_id: string;
  sku: string;
  name: string;
  item_type: string;
  reorder_point: number | string;
  is_active: boolean;
  available: number | string;
};

type InvoiceRow = {
  total_mad: number | string;
  issued_at: string;
  erp_payments: { amount_mad: number | string }[] | null;
  erp_invoice_adjustments: { amount_mad: number | string }[] | null;
};

type OrderRow = {
  id: string;
  document_number: string;
  client_name_snapshot: string;
  requested_delivery_date: string | null;
  priority: string;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    const supabase = await getSupabaseServerClient();
    const workspaceId = identity.workspaceId;
    const role = identity.role;
    const month = casablancaToday().slice(0, 7);
    const isManager = role === 'manager';
    const isDelivery = role === 'delivery';
    const needsStock = isManager || role === 'purchasing';

    const [stock, openOrders, invoices, openPurchases, suppliers, productionOpen, deliveryNotes, returnsOpen, clients, readyOrders] = await Promise.all([
      needsStock
        ? supabase
          .from('inventory_location_stock_balances')
          .select('item_id, sku, name, item_type, reorder_point, is_active, available')
          .eq('workspace_id', workspaceId)
        : EMPTY_ROWS,
      isManager
        ? supabase.from('erp_sales_orders').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['confirmed', 'part_delivered'])
        : EMPTY_COUNT,
      isManager
        ? supabase.from('erp_invoices').select('total_mad, issued_at, erp_payments(amount_mad), erp_invoice_adjustments(amount_mad)').eq('workspace_id', workspaceId).limit(5000)
        : EMPTY_ROWS,
      needsStock
        ? supabase.from('erp_purchase_orders').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['draft', 'ordered', 'part_received'])
        : EMPTY_COUNT,
      needsStock
        ? supabase.from('erp_suppliers').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('is_active', true)
        : EMPTY_COUNT,
      needsStock
        ? supabase.from('erp_production_orders').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['planned', 'in_progress'])
        : EMPTY_COUNT,
      isDelivery
        ? supabase.from('erp_delivery_notes').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['ready', 'dispatched'])
        : EMPTY_COUNT,
      isDelivery
        ? supabase.from('erp_customer_returns').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['requested', 'inspection'])
        : EMPTY_COUNT,
      isDelivery
        ? supabase.from('erp_clients').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('is_active', true)
        : EMPTY_COUNT,
      isDelivery
        ? supabase
          .from('erp_sales_orders')
          .select('id, document_number, client_name_snapshot, requested_delivery_date, priority')
          .eq('workspace_id', workspaceId)
          .eq('assigned_driver_id', identity.userId)
          .in('status', ['confirmed', 'part_delivered'])
          .order('requested_delivery_date', { ascending: true, nullsFirst: false })
          .limit(50)
        : EMPTY_ROWS,
    ]);

    const failed = [stock, openOrders, invoices, openPurchases, suppliers, productionOpen, deliveryNotes, returnsOpen, clients, readyOrders].find((result) => result.error);
    if (failed) {
      console.error('Could not load overview', { code: failed.error?.code });
      return fail('Could not load the overview.', 503);
    }

    const totals = new Map<string, { sku: string; name: string; reorderPoint: number; available: number }>();
    for (const row of (stock.data ?? []) as BalanceRow[]) {
      if (!row.is_active || Number(row.reorder_point) <= 0 || row.item_type === 'finished_good') continue;
      const entry = totals.get(row.item_id) ?? { sku: row.sku, name: row.name, reorderPoint: Number(row.reorder_point), available: 0 };
      entry.available += Number(row.available);
      totals.set(row.item_id, entry);
    }
    const lowStock = [...totals.values()]
      .filter((entry) => entry.available <= entry.reorderPoint)
      .sort((a, b) => a.available / a.reorderPoint - b.available / b.reorderPoint);

    let salesThisMonth = 0;
    let outstanding = 0;
    for (const invoice of (invoices.data ?? []) as unknown as InvoiceRow[]) {
      const total = Number(invoice.total_mad);
      const paid = (invoice.erp_payments ?? []).reduce((sum, payment) => sum + Number(payment.amount_mad), 0);
      const adjusted = (invoice.erp_invoice_adjustments ?? []).reduce((sum, adjustment) => sum + Number(adjustment.amount_mad), 0);
      outstanding += Math.max(0, total + adjusted - paid);
      if (invoice.issued_at.slice(0, 7) === month) salesThisMonth += total + Math.min(0, adjusted);
    }

    const orders = (readyOrders.data ?? []) as OrderRow[];

    return NextResponse.json({
      role,
      salesThisMonthMad: Math.round(salesThisMonth * 100) / 100,
      outstandingMad: Math.round(outstanding * 100) / 100,
      openOrders: openOrders.count ?? 0,
      lowStockCount: lowStock.length,
      openPurchaseOrders: openPurchases.count ?? 0,
      activeSuppliers: suppliers.count ?? 0,
      openProduction: productionOpen.count ?? 0,
      activeDeliveryNotes: deliveryNotes.count ?? 0,
      pendingReturns: returnsOpen.count ?? 0,
      activeClients: clients.count ?? 0,
      readyToDeliver: orders.length,
      lowStock: lowStock.slice(0, 5),
      deliveries: orders.slice(0, 5).map((order) => ({
        id: order.id,
        documentNumber: order.document_number,
        clientName: order.client_name_snapshot,
        requestedDeliveryDate: order.requested_delivery_date,
        priority: order.priority,
      })),
    }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
    if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
    return fail('Overview is unavailable.', 503);
  }
}
