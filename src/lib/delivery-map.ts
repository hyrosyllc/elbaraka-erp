export type OrderStatus = 'draft' | 'confirmed' | 'part_delivered' | 'delivered' | 'cancelled';
export type OrderPriority = 'normal' | 'urgent';
export type Urgency = 'overdue' | 'due_today' | 'upcoming' | 'awaiting' | 'none';

export const OPEN_ORDER_STATUSES: OrderStatus[] = ['draft', 'confirmed', 'part_delivered'];

export type MapOrder = {
  id: string;
  documentNumber: string;
  status: OrderStatus;
  priority: OrderPriority;
  requestedDeliveryDate: string | null;
  assignedDriverId: string | null;
  totalMad: number;
  lineCount: number;
  createdAt: string;
};

export type MapClient = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  defaultDriverId: string | null;
  driverId: string | null;
  urgency: Urgency;
  openOrders: MapOrder[];
};

export type MapDriver = { userId: string; fullName: string };

export const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 4,
  due_today: 3,
  upcoming: 2,
  awaiting: 1,
  none: 0,
};

export function casablancaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function orderUrgency(order: Pick<MapOrder, 'status' | 'priority' | 'requestedDeliveryDate'>, today: string): Urgency {
  if (!OPEN_ORDER_STATUSES.includes(order.status)) return 'none';
  if (order.requestedDeliveryDate && order.requestedDeliveryDate < today) return 'overdue';
  if (order.priority === 'urgent' || order.requestedDeliveryDate === today) return 'due_today';
  if (order.status === 'draft') return 'awaiting';
  return 'upcoming';
}

export function clientUrgency(orders: MapOrder[], today: string): Urgency {
  let result: Urgency = 'none';
  for (const order of orders) {
    const urgency = orderUrgency(order, today);
    if (URGENCY_RANK[urgency] > URGENCY_RANK[result]) result = urgency;
  }
  return result;
}

// The driver of the most urgent open order wins; otherwise the client's default driver.
export function clientDriverId(orders: MapOrder[], defaultDriverId: string | null, today: string): string | null {
  let best: MapOrder | null = null;
  for (const order of orders) {
    if (!order.assignedDriverId) continue;
    if (!best || URGENCY_RANK[orderUrgency(order, today)] > URGENCY_RANK[orderUrgency(best, today)]) best = order;
  }
  return best?.assignedDriverId ?? defaultDriverId;
}

export const URGENCY_COLORS: Record<Urgency, string> = {
  overdue: '#dc2626',
  due_today: '#d97706',
  upcoming: '#16a34a',
  awaiting: '#64748b',
  none: '#cbd5e1',
};

const DRIVER_PALETTE = ['#2563eb', '#9333ea', '#0d9488', '#db2777', '#ca8a04', '#ea580c', '#4f46e5', '#0891b2'];
export const UNASSIGNED_COLOR = '#94a3b8';

export function driverColors(drivers: MapDriver[]): Map<string, string> {
  const sorted = [...drivers].sort((a, b) => a.fullName.localeCompare(b.fullName) || a.userId.localeCompare(b.userId));
  return new Map(sorted.map((driver, index) => [driver.userId, DRIVER_PALETTE[index % DRIVER_PALETTE.length]]));
}
