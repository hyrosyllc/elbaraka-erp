import { NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import {
  OPEN_ORDER_STATUSES,
  casablancaToday,
  clientDriverId,
  clientUrgency,
  type MapClient,
  type MapDriver,
  type MapOrder,
  type OrderPriority,
  type OrderStatus,
} from '@/lib/delivery-map';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  document_number: string;
  client_id: string;
  status: OrderStatus;
  priority: OrderPriority;
  requested_delivery_date: string | null;
  assigned_driver_id: string | null;
  created_at: string;
  erp_sales_order_lines: { quantity: number; unit_price_mad: number | string }[] | null;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'delivery') return fail('Delivery map access required.', 403);

    const supabase = await getSupabaseServerClient();
    const [clientsResult, ordersResult, driversResult, invoicesResult] = await Promise.all([
      supabase
        .from('erp_clients')
        .select('id, name, contact_name, phone, address, city, latitude, longitude, default_driver_id')
        .eq('workspace_id', identity.workspaceId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('erp_sales_orders')
        .select('id, document_number, client_id, status, priority, requested_delivery_date, assigned_driver_id, created_at, erp_sales_order_lines(quantity, unit_price_mad)')
        .eq('workspace_id', identity.workspaceId)
        .in('status', OPEN_ORDER_STATUSES)
        .order('created_at', { ascending: false })
        .limit(2000),
      identity.role === 'manager' ? supabase.rpc('erp_list_workspace_drivers') : Promise.resolve({ data: [], error: null }),
      identity.role === 'manager'
        ? supabase
          .from('erp_invoices')
          .select('client_id, total_mad, due_date, erp_payments(amount_mad)')
          .eq('workspace_id', identity.workspaceId)
          .limit(5000)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (clientsResult.error || ordersResult.error || driversResult.error || invoicesResult.error) {
      console.error('Could not load delivery map data', {
        clients: clientsResult.error?.code,
        orders: ordersResult.error?.code,
        drivers: driversResult.error?.code,
        invoices: invoicesResult.error?.code,
      });
      return fail('Could not load delivery map data.', 503);
    }

    const today = casablancaToday();
    const ordersByClient = new Map<string, MapOrder[]>();
    for (const row of (ordersResult.data ?? []) as unknown as OrderRow[]) {
      if (identity.role === 'delivery' && row.assigned_driver_id !== identity.userId) continue;
      const lines = row.erp_sales_order_lines ?? [];
      const order: MapOrder = {
        id: row.id,
        documentNumber: row.document_number,
        status: row.status,
        priority: row.priority,
        requestedDeliveryDate: row.requested_delivery_date,
        assignedDriverId: row.assigned_driver_id,
        totalMad: lines.reduce((sum, line) => sum + line.quantity * Number(line.unit_price_mad), 0),
        lineCount: lines.length,
        createdAt: row.created_at,
      };
      const list = ordersByClient.get(row.client_id) ?? [];
      list.push(order);
      ordersByClient.set(row.client_id, list);
    }

    const balances = new Map<string, { balance: number; overdue: number }>();
    for (const invoice of (invoicesResult.data ?? []) as unknown as { client_id: string; total_mad: number | string; due_date: string | null; erp_payments: { amount_mad: number | string }[] | null }[]) {
      const paid = (invoice.erp_payments ?? []).reduce((sum, payment) => sum + Number(payment.amount_mad), 0);
      const due = Math.round((Number(invoice.total_mad) - paid) * 100) / 100;
      if (due <= 0) continue;
      const entry = balances.get(invoice.client_id) ?? { balance: 0, overdue: 0 };
      entry.balance += due;
      if (invoice.due_date !== null && invoice.due_date < today) entry.overdue += due;
      balances.set(invoice.client_id, entry);
    }

    const clients: MapClient[] = [];
    for (const row of clientsResult.data ?? []) {
      const openOrders = ordersByClient.get(row.id) ?? [];
      if (identity.role === 'delivery' && openOrders.length === 0 && row.default_driver_id !== identity.userId) continue;
      clients.push({
        id: row.id,
        name: row.name,
        contactName: row.contact_name,
        phone: row.phone,
        address: row.address,
        city: row.city,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        defaultDriverId: row.default_driver_id,
        driverId: clientDriverId(openOrders, row.default_driver_id, today),
        urgency: clientUrgency(openOrders, today),
        openOrders,
        ...(identity.role === 'manager' ? { balanceMad: balances.get(row.id)?.balance ?? 0, overdueMad: balances.get(row.id)?.overdue ?? 0 } : {}),
      });
    }

    const drivers: MapDriver[] = ((driversResult.data ?? []) as { user_id: string; full_name: string }[]).map((driver) => ({
      userId: driver.user_id,
      fullName: driver.full_name,
    }));

    return NextResponse.json(
      { clients, drivers, today, canManage: identity.role === 'manager' },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
    if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
    return fail('Delivery map is unavailable.', 503);
  }
}
