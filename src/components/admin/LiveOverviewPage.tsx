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
  workflow: {
    activeProducts: number;
    activeSizes: number;
    sizesMissingSku: number;
    sizesMissingPrice: number;
    sizesMissingInventoryLink: number;
    activeInventoryItems: number;
    rawMaterials: number;
    activeLocations: number;
    openingCounts: number;
    approvedRecipes: number;
    draftRecipes: number;
    invoices: number;
  };
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
  const number = (value: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-MA' : 'en-MA').format(value);
  const workflow = overview.workflow;
  const catalogStatus = workflow.activeProducts === 0 || workflow.activeSizes === 0
    ? 'flowNeedsSetup'
    : workflow.sizesMissingSku > 0
      ? 'flowNeedsSku'
      : workflow.sizesMissingPrice > 0
        ? 'flowNeedsPrice'
        : workflow.sizesMissingInventoryLink > 0
          ? 'flowNeedsStockLink'
          : 'flowReady';
  const inventoryStatus = workflow.activeInventoryItems === 0 || workflow.rawMaterials === 0 || workflow.activeLocations === 0
    ? 'flowNeedsSetup'
    : workflow.openingCounts === 0
      ? 'flowNeedsCount'
      : 'flowInProgress';
  const recipeStatus = workflow.approvedRecipes === 0
    ? workflow.draftRecipes > 0 ? 'flowNeedsApproval' : 'flowNeedsRecipe'
    : workflow.draftRecipes > 0 ? 'flowInProgress' : 'flowReady';
  const steps = role === 'manager'
    ? [
      { page: 'catalog' as const, label: t('flowCatalog'), detail: `${number(workflow.activeProducts)} ${t('flowProductCount')} · ${number(workflow.activeSizes)} ${t('flowSizeCount')}`, status: t(catalogStatus) },
      { page: 'inventory' as const, label: t('flowInventory'), detail: `${number(workflow.activeInventoryItems)} ${t('flowInventoryItemCount')} · ${number(workflow.activeLocations)} ${t('flowLocationCount')} · ${number(workflow.openingCounts)} ${t('flowOpeningCount')}`, status: t(inventoryStatus) },
      { page: 'recipes' as const, label: t('flowRecipes'), detail: `${number(workflow.approvedRecipes)} ${t('flowApprovedCount')} · ${number(workflow.draftRecipes)} ${t('flowDraftCount')}`, status: t(recipeStatus) },
      { page: 'purchasing' as const, label: t('flowPurchasing'), detail: `${number(overview.activeSuppliers)} ${t('flowSupplierCount')} · ${number(overview.openPurchaseOrders)} ${t('flowPurchaseOrderCount')}`, status: t(overview.activeSuppliers === 0 ? 'flowNeedsSetup' : overview.openPurchaseOrders > 0 ? 'flowInProgress' : 'flowReady') },
      { page: 'production' as const, label: t('flowProduction'), detail: `${number(overview.openProduction)} ${t('flowOpenBatchCount')}`, status: t(overview.openProduction > 0 ? 'flowInProgress' : workflow.approvedRecipes === 0 ? 'flowWaiting' : 'flowReady') },
      { page: 'orders' as const, label: t('flowSales'), detail: `${number(overview.activeClients)} ${t('flowCustomerCount')} · ${number(overview.openOrders)} ${t('flowOpenOrderCount')}`, status: t(overview.activeClients === 0 ? 'flowNeedsSetup' : overview.openOrders > 0 ? 'flowInProgress' : 'flowWaiting') },
      { page: 'deliveries' as const, label: t('flowDelivery'), detail: `${number(overview.activeDeliveryNotes)} ${t('flowDeliveryNoteCount')}`, status: t(overview.activeDeliveryNotes > 0 ? 'flowInProgress' : 'flowWaiting') },
      { page: 'invoices' as const, label: t('flowFinance'), detail: `${number(workflow.invoices)} ${t('flowInvoiceCount')} · ${number(overview.pendingReturns)} ${t('flowReturnCount')}`, status: t(workflow.invoices + overview.pendingReturns > 0 ? 'flowInProgress' : 'flowWaiting') },
    ]
    : role === 'purchasing'
      ? [
        { page: 'catalog' as const, label: t('flowCatalog'), detail: `${number(workflow.activeProducts)} ${t('flowProductCount')} · ${number(workflow.activeSizes)} ${t('flowSizeCount')}`, status: t(catalogStatus) },
        { page: 'inventory' as const, label: t('flowInventory'), detail: `${number(workflow.activeInventoryItems)} ${t('flowInventoryItemCount')} · ${number(workflow.rawMaterials)} ${t('flowRawMaterialCount')}`, status: t(inventoryStatus) },
        { page: 'recipes' as const, label: t('flowRecipes'), detail: `${number(workflow.approvedRecipes)} ${t('flowApprovedCount')} · ${number(workflow.draftRecipes)} ${t('flowDraftCount')}`, status: t(recipeStatus) },
        { page: 'purchasing' as const, label: t('flowPurchasing'), detail: `${number(overview.activeSuppliers)} ${t('flowSupplierCount')} · ${number(overview.openPurchaseOrders)} ${t('flowPurchaseOrderCount')}`, status: t(overview.activeSuppliers === 0 ? 'flowNeedsSetup' : overview.openPurchaseOrders > 0 ? 'flowInProgress' : 'flowReady') },
        { page: 'production' as const, label: t('flowProduction'), detail: `${number(overview.openProduction)} ${t('flowOpenBatchCount')}`, status: t(overview.openProduction > 0 ? 'flowInProgress' : workflow.approvedRecipes === 0 ? 'flowWaiting' : 'flowReady') },
      ]
      : [
        { page: 'orders' as const, label: t('flowSales'), detail: `${number(overview.readyToDeliver)} ${t('flowOpenOrderCount')}`, status: t(overview.readyToDeliver > 0 ? 'flowInProgress' : 'flowWaiting') },
        { page: 'deliveries' as const, label: t('flowDelivery'), detail: `${number(overview.activeDeliveryNotes)} ${t('flowDeliveryNoteCount')}`, status: t(overview.activeDeliveryNotes > 0 ? 'flowInProgress' : 'flowWaiting') },
        { page: 'returns' as const, label: t('flowReturns'), detail: `${number(overview.pendingReturns)} ${t('flowReturnCount')}`, status: t(overview.pendingReturns > 0 ? 'flowInProgress' : 'flowReady') },
      ];

  return (
    <div className="grid gap-[18px]">
      <section className="border-y border-border py-4" aria-label={t('flowTitle')}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="m-0 text-base font-bold text-foreground">{t('flowTitle')}</h2>
            <p className="mb-0 mt-1 text-caption text-subtle">{t('flowSubtitle')}</p>
          </div>
        </div>
        <ol className="m-0 grid list-none grid-cols-1 gap-x-0 gap-y-1 p-0 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          {steps.map((step, index) => (
            <li key={step.page} className="min-w-0 border-b border-divider last:border-b-0 sm:odd:border-e sm:even:border-e-0 lg:odd:border-e lg:even:border-e-0 2xl:border-e 2xl:last:border-e-0">
              <button
                type="button"
                onClick={() => onNavigate(step.page)}
                className="grid min-h-[110px] w-full content-start gap-1.5 px-3 py-3 text-start transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-saffron/50"
                aria-label={`${step.label}: ${step.status}. ${step.detail}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-muted text-micro font-bold text-muted-foreground" aria-hidden="true">{number(index + 1)}</span>
                  <span className="text-micro font-semibold text-primary">{step.status}</span>
                </span>
                <strong className="text-label font-bold text-foreground">{step.label}</strong>
                <span className="text-micro leading-relaxed text-subtle">{step.detail}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="grid grid-cols-2 overflow-hidden rounded-[9px] border border-border bg-card min-[761px]:grid-cols-4" aria-label={t('operations')}>
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
