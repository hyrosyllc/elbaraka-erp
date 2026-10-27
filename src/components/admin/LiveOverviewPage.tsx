'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatMad, type WorkspacePage, type WorkspaceRole } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

type Overview = {
  salesThisMonthMad: number;
  outstandingMad: number;
  openOrders: number;
  lowStockCount: number;
  openPurchaseOrders: number;
  activeSuppliers: number;
  openProduction: number;
  activeDeliveryNotes: number;
  pendingReturns: number;
  activeClients: number;
  readyToDeliver: number;
  lowStock: { sku: string; name: string; reorderPoint: number; available: number }[];
  deliveries: { id: string; documentNumber: string; clientName: string; requestedDeliveryDate: string | null; priority: string }[];
};

export function LiveOverviewPage({ role, onNavigate }: { role: WorkspaceRole; onNavigate: (page: WorkspacePage) => void }) {
  const { t, locale } = useLocale();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false);
    try {
      const response = await fetch('/api/operations/overview', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('overview');
      setOverview(await response.json() as Overview);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (failed) {
    return (
      <p className="m-0 rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">
        {t('mapLoadError')} <Button type="button" variant="link" onClick={() => void load()}>{t('retry')}</Button>
      </p>
    );
  }
  if (!overview) return <p className="m-0 text-sm text-subtle" role="status">{t('mapLoadingOrders')}</p>;

  const metrics = role === 'manager'
    ? [
      { label: t('salesThisMonth'), value: formatMad(overview.salesThisMonthMad, locale), foot: t('navInvoices') },
      { label: t('openOrders'), value: String(overview.openOrders), foot: t('awaitingDispatch') },
      { label: t('outstandingInvoices'), value: formatMad(overview.outstandingMad, locale), foot: t('balanceDue') },
      { label: t('lowStock'), value: String(overview.lowStockCount), foot: t('stockToBuy') },
    ]
    : role === 'purchasing'
      ? [
        { label: t('itemsToBuy'), value: String(overview.lowStockCount), foot: t('stockToBuy') },
        { label: t('navProduction'), value: String(overview.openProduction), foot: t('productionQueue') },
        { label: t('openPurchaseOrders'), value: String(overview.openPurchaseOrders), foot: t('supplierOrders') },
        { label: t('activeSuppliers'), value: String(overview.activeSuppliers), foot: t('purchasing') },
      ]
      : [
        { label: t('readyToDeliver'), value: String(overview.readyToDeliver), foot: t('openOrders') },
        { label: t('navDeliveries'), value: String(overview.activeDeliveryNotes), foot: t('navDeliveries') },
        { label: t('navReturns'), value: String(overview.pendingReturns), foot: t('inspection') },
        { label: t('navClients'), value: String(overview.activeClients), foot: t('customerOrStore') },
      ];

  const attention = role === 'delivery' ? overview.deliveries : overview.lowStock;
  const attentionPage: WorkspacePage = role === 'delivery' ? 'orders' : role === 'purchasing' ? 'purchasing' : 'inventory';

  return (
    <div className="grid gap-[18px]">
      <section className="grid grid-cols-2 overflow-hidden rounded-[9px] border border-border bg-white min-[761px]:grid-cols-4" aria-label={t('operations')}>
        {metrics.map((metric) => (
          <div className="grid min-h-[102px] content-center gap-1 border-b border-e border-border p-[14px] min-[761px]:min-h-[114px] min-[761px]:border-b-0 min-[761px]:px-[21px] min-[761px]:py-[17px]" key={metric.label}>
            <span className="text-label font-medium text-subtle">{metric.label}</span>
            <strong>{metric.value}</strong>
            <span className="text-caption text-subtle">{metric.foot}</span>
          </div>
        ))}
      </section>
      <Card className="grid gap-3 rounded-[9px] border border-border bg-card px-[21px] py-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-bold">{t(role === 'delivery' ? 'openOrders' : 'lowStock')}</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate(attentionPage)}>{t(role === 'delivery' ? 'navOrders' : role === 'purchasing' ? 'purchasing' : 'navInventory')}</Button>
        </div>
        {attention.length === 0 ? (
          <p className="m-0 text-xs text-subtle">{t(role === 'delivery' ? 'noOrders' : 'noLowStock')}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {role === 'delivery'
              ? overview.deliveries.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm last:border-0">
                  <span><strong>{order.documentNumber}</strong> · {order.clientName}</span>
                  <span className="flex items-center gap-2 text-xs text-subtle" dir="ltr">
                    {order.priority === 'urgent' && <Badge variant="destructive">{t('priorityUrgent')}</Badge>}
                    {order.requestedDeliveryDate}
                  </span>
                </li>
              ))
              : overview.lowStock.map((item) => (
                <li key={item.sku} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm last:border-0">
                  <span><strong>{item.name}</strong> <small className="text-subtle">{item.sku}</small></span>
                  <span className="text-xs text-subtle" dir="ltr">{t('available')}: {item.available} / {item.reorderPoint}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
