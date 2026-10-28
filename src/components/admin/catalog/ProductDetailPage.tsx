'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TranslationKey } from '@/lib/i18n';
import { formatMad, workspacePath } from '@/lib/workspace';
import { useLocale } from '../LocaleContext';
import { formatPackSize } from './useCatalogData';

type Range = '30' | '90' | '365' | 'all';
type Kpis = {
  orderCount: number; orderedUnits: number; orderedRevenue: number; deliveredUnits: number; deliveredRevenue: number;
  inTransitUnits: number; returnedUnits: number; requestedReturnUnits: number; returnRate: number; averageOrderValue: number;
  averageUnitPrice: number; weightKg: number; uniqueClients: number; firstSaleAt: string | null; lastSaleAt: string | null;
  dailyRate: number; stockOnHand: number; daysOfCover: number | null; producedUnits: number; shippedUnits: number;
};
type Analytics = {
  product: { id: string; name_ar: string; name: string; stock_unit: string; is_active: boolean; created_at: string; updated_at: string };
  category: { id: string; name_ar: string; name: string } | null;
  sizes: Array<{ id: string; size_g: number | string; sku: string | null; sale_price_mad: number | string | null; inventory_item_id: string | null; is_active: boolean }>;
  linked: boolean;
  truncated: boolean;
  kpis?: Kpis;
  monthly?: Array<{ month: string; units: number; revenue: number }>;
  byStatus?: Array<{ status: string; orders: number; units: number; revenue: number }>;
  bySize?: Array<{ sizeId: string; units: number; revenue: number; delivered: number; returned: number; stock: number }>;
  topClients?: Array<{ clientId: string; name: string; orders: number; units: number; revenue: number; lastOrderAt: string }>;
  returnReasons?: Array<{ reason: string; units: number }>;
  recentOrders?: Array<{ id: string; documentNumber: string; status: string; client: string; quantity: number; unitPrice: number; total: number; createdAt: string }>;
  recentReturns?: Array<{ id: string; documentNumber: string; status: string; client: string; quantity: number; reason: string; createdAt: string }>;
  recentMovements?: Array<{ type: string; quantity: number; recordedAt: string; sku: string | null }>;
  production?: Array<{ id: string; documentNumber: string; status: string; target: number; actual: number | null; createdAt: string }>;
};

const RANGE_KEYS = { '30': 'prodRange30', '90': 'prodRange90', '365': 'prodRange365', all: 'prodRangeAll' } as const satisfies Record<Range, TranslationKey>;
const STATUS_KEYS: Record<string, TranslationKey> = {
  draft: 'ordSt_draft', confirmed: 'ordSt_confirmed', part_delivered: 'ordSt_part_delivered', delivered: 'ordSt_delivered', cancelled: 'ordSt_cancelled',
  requested: 'requested', inspection: 'inspection', released: 'released', rejected: 'rejected',
  planned: 'planned', in_progress: 'inProgress', completed: 'completed',
};
const MOVEMENT_KEYS: Record<string, TranslationKey> = {
  opening_balance: 'mv_opening_balance', production_output: 'mv_production_output', production_consumption: 'mv_production_consumption',
  shipment: 'mv_shipment', customer_return: 'mv_customer_return', adjustment: 'mv_adjustment', purchase_receipt: 'mv_purchase_receipt',
  supplier_return: 'mv_supplier_return', transfer_in: 'mv_transfer_in', transfer_out: 'mv_transfer_out',
};

function csvCell(value: string | number | null) {
  const text = value === null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'warning' | 'destructive' }) {
  return (
    <Card className="grid gap-1 p-4">
      <span className="text-caption font-semibold text-subtle">{label}</span>
      <strong className={`text-xl font-bold tabular-nums ${tone === 'destructive' ? 'text-destructive' : 'text-foreground'}`}>{value}</strong>
      {hint && <small className="text-caption text-subtle">{hint}</small>}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="grid min-w-0 gap-3 p-4">
      <h2 className="m-0 text-base font-bold">{title}</h2>
      {children}
    </Card>
  );
}

export function ProductDetailPage({ productId }: { productId: string }) {
  const { t, locale } = useLocale();
  const [range, setRange] = useState<Range>('90');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<'' | 'missing' | 'failed'>('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErrorKey('');
    try {
      const response = await fetch(`/api/admin/catalog/products/${productId}/analytics?range=${range}`, { cache: 'no-store', signal });
      if (response.status === 404) { setErrorKey('missing'); return; }
      if (!response.ok) throw new Error('analytics');
      setData(await response.json() as Analytics);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setErrorKey('failed');
    } finally {
      setLoading(false);
    }
  }, [productId, range]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const date = useMemo(() => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'en-GB', { dateStyle: 'medium' }), [locale]);
  const number = useMemo(() => new Intl.NumberFormat(locale === 'ar' ? 'ar-MA' : 'en-GB', { maximumFractionDigits: 2 }), [locale]);
  const mad = (value: number) => formatMad(value, locale);
  const fmtDate = (iso: string | null) => (iso ? date.format(new Date(iso)) : '—');
  const statusLabel = (status: string) => (STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status);

  const sizeLabel = (sizeId: string) => {
    const size = data?.sizes.find((candidate) => candidate.id === sizeId);
    if (!size) return '—';
    return `${formatPackSize(size.size_g)}${size.sku ? ` · ${size.sku}` : ''}`;
  };

  const exportCsv = () => {
    if (!data?.kpis) return;
    const name = data.product.name || data.product.name_ar;
    const rows: Array<Array<string | number | null>> = [
      [name, t(RANGE_KEYS[range])],
      [],
      [t('prodMonthly')], ['Month', t('prodUnits'), t('prodRevenue')],
      ...(data.monthly ?? []).map((row) => [row.month, row.units, row.revenue]),
      [],
      [t('prodTopClients')], [t('navClients'), t('prodOrders'), t('prodUnits'), t('prodRevenue')],
      ...(data.topClients ?? []).map((row) => [row.name, row.orders, row.units, row.revenue]),
      [],
      [t('prodRecentOrders')], ['#', t('navClients'), t('prodUnits'), 'MAD', 'Total', 'Date'],
      ...(data.recentOrders ?? []).map((row) => [row.documentNumber, row.client, row.quantity, row.unitPrice, row.total, row.createdAt.slice(0, 10)]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `product-${data.product.id.slice(0, 8)}-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const backLink = (
    <Button asChild variant="outline" size="sm">
      <Link href={workspacePath('catalog', 'products')}><ArrowLeft size={16} className="rtl:rotate-180" />{t('prodBack')}</Link>
    </Button>
  );

  if (errorKey) {
    return (
      <div className="grid gap-4">
        <div>{backLink}</div>
        <Card className="p-6 text-sm text-destructive" role="alert">{errorKey === 'missing' ? t('prodNoData') : t('catLoadError')}</Card>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4"><div>{backLink}</div><Card className="p-6 text-sm text-subtle">{loading ? t('catLoading') : t('prodNoData')}</Card></div>;

  const kpis = data.kpis;
  const productName = locale === 'ar' ? data.product.name_ar : data.product.name || data.product.name_ar;
  const secondaryName = locale === 'ar' ? data.product.name : data.product.name_ar;
  const categoryName = data.category ? (locale === 'ar' ? data.category.name_ar : data.category.name || data.category.name_ar) : t('uncategorized');
  const maxRevenue = Math.max(1, ...(data.monthly ?? []).map((row) => row.revenue));
  const maxClient = Math.max(1, ...(data.topClients ?? []).map((row) => row.revenue));

  return (
    <div className="grid gap-4 print:gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 break-words text-xl font-bold">{productName}</h2>
            <Badge variant={data.product.is_active ? 'success' : 'secondary'}>{data.product.is_active ? t('active') : t('inactive')}</Badge>
            <Badge variant="outline">{categoryName}</Badge>
          </div>
          {secondaryName && <span className="text-sm text-subtle" dir={locale === 'ar' ? 'ltr' : 'rtl'}>{secondaryName}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {backLink}
          <Select value={range} onValueChange={(value) => setRange(value as Range)}>
            <SelectTrigger className="w-[170px]" aria-label={t('prodRange')}><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(RANGE_KEYS) as Range[]).map((key) => <SelectItem key={key} value={key}>{t(RANGE_KEYS[key])}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!kpis}><Download size={16} />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={16} />{t('prodPrint')}</Button>
        </div>
      </div>

      {data.truncated && <Card className="p-3 text-sm text-subtle" role="status">{t('prodTruncated')}</Card>}

      {!data.linked || !kpis ? (
        <Card className="grid gap-1 p-6">
          <strong>{t('prodNotLinkedTitle')}</strong>
          <p className="m-0 text-sm text-subtle">{t('prodNotLinkedBody')}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={t('prodRevenue')} value={mad(kpis.orderedRevenue)} hint={`${t('prodDeliveredRevenue')}: ${mad(kpis.deliveredRevenue)}`} />
            <Stat label={t('prodUnitsOrdered')} value={number.format(kpis.orderedUnits)} hint={`${t('prodWeightSold')}: ${number.format(kpis.weightKg)} kg`} />
            <Stat label={t('prodOrders')} value={number.format(kpis.orderCount)} hint={`${t('prodClients')}: ${number.format(kpis.uniqueClients)}`} />
            <Stat label={t('prodAvgOrder')} value={mad(kpis.averageOrderValue)} hint={`${t('prodAvgPrice')}: ${mad(kpis.averageUnitPrice)}`} />
            <Stat label={t('prodDeliveredUnits')} value={number.format(kpis.deliveredUnits)} hint={`${t('prodInTransit')}: ${number.format(kpis.inTransitUnits)}`} />
            <Stat label={t('prodReturned')} value={number.format(kpis.returnedUnits)} hint={`${t('prodReturnRate')}: ${kpis.returnRate}%`} tone={kpis.returnRate >= 10 ? 'destructive' : undefined} />
            <Stat label={t('prodStockOnHand')} value={number.format(kpis.stockOnHand)} hint={`${t('prodCover')}: ${kpis.daysOfCover === null ? '—' : number.format(kpis.daysOfCover)}`} />
            <Stat label={t('prodDailyRate')} value={number.format(kpis.dailyRate)} hint={`${t('prodFirstSale')}: ${fmtDate(kpis.firstSaleAt)} · ${t('prodLastSale')}: ${fmtDate(kpis.lastSaleAt)}`} />
          </div>

          <Section title={t('prodMonthly')}>
            {(data.monthly ?? []).length === 0 ? <p className="m-0 text-sm text-subtle">{t('prodMonthlyEmpty')}</p> : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {(data.monthly ?? []).map((row) => (
                  <li key={row.month} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <span className="text-subtle tabular-nums">{row.month}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${row.month}: ${mad(row.revenue)}`}>
                      <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${Math.max(2, (row.revenue / maxRevenue) * 100)}%` }} />
                    </div>
                    <span className="tabular-nums">{mad(row.revenue)} · {number.format(row.units)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t('prodBySize')}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>{t('catSizeLabel')}</TableHead><TableHead>{t('prodUnits')}</TableHead><TableHead>{t('prodRevenue')}</TableHead><TableHead>{t('prodDeliveredUnits')}</TableHead><TableHead>{t('prodReturned')}</TableHead><TableHead>{t('prodStockOnHand')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(data.bySize ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-subtle">{t('prodNoData')}</TableCell></TableRow> : (data.bySize ?? []).map((row) => (
                      <TableRow key={row.sizeId}>
                        <TableCell>{sizeLabel(row.sizeId)}</TableCell>
                        <TableCell className="tabular-nums">{number.format(row.units)}</TableCell>
                        <TableCell className="tabular-nums">{mad(row.revenue)}</TableCell>
                        <TableCell className="tabular-nums">{number.format(row.delivered)}</TableCell>
                        <TableCell className="tabular-nums">{number.format(row.returned)}</TableCell>
                        <TableCell className="tabular-nums">{number.format(row.stock)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>

            <Section title={t('prodByStatus')}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>{t('status')}</TableHead><TableHead>{t('prodOrders')}</TableHead><TableHead>{t('prodUnits')}</TableHead><TableHead>{t('prodRevenue')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(data.byStatus ?? []).length === 0 ? <TableRow><TableCell colSpan={4} className="text-subtle">{t('prodNoData')}</TableCell></TableRow> : (data.byStatus ?? []).map((row) => (
                      <TableRow key={row.status}>
                        <TableCell><Badge variant={row.status === 'cancelled' ? 'destructive' : row.status === 'delivered' ? 'success' : 'secondary'}>{statusLabel(row.status)}</Badge></TableCell>
                        <TableCell className="tabular-nums">{number.format(row.orders)}</TableCell>
                        <TableCell className="tabular-nums">{number.format(row.units)}</TableCell>
                        <TableCell className="tabular-nums">{mad(row.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t('prodTopClients')}>
              {(data.topClients ?? []).length === 0 ? <p className="m-0 text-sm text-subtle">{t('prodNoData')}</p> : (
                <ul className="m-0 grid list-none gap-3 p-0">
                  {(data.topClients ?? []).map((client) => (
                    <li key={client.clientId} className="grid gap-1 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <strong className="break-words">{client.name}</strong>
                        <span className="tabular-nums">{mad(client.revenue)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${Math.max(2, (client.revenue / maxClient) * 100)}%` }} /></div>
                      <small className="text-caption text-subtle">{number.format(client.orders)} {t('prodOrders')} · {number.format(client.units)} {t('prodUnits')} · {t('prodLastOrder')}: {fmtDate(client.lastOrderAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={t('prodRecentReturns')}>
              {(data.recentReturns ?? []).length === 0 ? <p className="m-0 text-sm text-subtle">{t('prodNoData')}</p> : (
                <>
                  {(data.returnReasons ?? []).length > 0 && (
                    <div className="grid gap-1 text-sm"><strong>{t('prodReturnReasons')}</strong>
                      {(data.returnReasons ?? []).map((row) => <span key={row.reason} className="text-subtle">{row.reason} · {number.format(row.units)}</span>)}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableBody>
                        {(data.recentReturns ?? []).map((row) => (
                          <TableRow key={`${row.id}-${row.quantity}`}>
                            <TableCell>{row.documentNumber}</TableCell>
                            <TableCell>{row.client}</TableCell>
                            <TableCell className="tabular-nums">{number.format(row.quantity)}</TableCell>
                            <TableCell><Badge variant={row.status === 'released' ? 'success' : 'warning'}>{statusLabel(row.status)}</Badge></TableCell>
                            <TableCell>{fmtDate(row.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </Section>
          </div>

          <Section title={t('prodRecentOrders')}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>{t('navClients')}</TableHead><TableHead>{t('status')}</TableHead><TableHead>{t('prodUnits')}</TableHead><TableHead>{t('prodAvgPrice')}</TableHead><TableHead>{t('total')}</TableHead><TableHead>{t('prodCreated')}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(data.recentOrders ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-subtle">{t('prodNoData')}</TableCell></TableRow> : (data.recentOrders ?? []).map((row) => (
                    <TableRow key={`${row.id}-${row.unitPrice}-${row.quantity}`}>
                      <TableCell>{row.documentNumber}</TableCell>
                      <TableCell>{row.client}</TableCell>
                      <TableCell><Badge variant={row.status === 'cancelled' ? 'destructive' : row.status === 'delivered' ? 'success' : 'secondary'}>{statusLabel(row.status)}</Badge></TableCell>
                      <TableCell className="tabular-nums">{number.format(row.quantity)}</TableCell>
                      <TableCell className="tabular-nums">{mad(row.unitPrice)}</TableCell>
                      <TableCell className="tabular-nums">{mad(row.total)}</TableCell>
                      <TableCell>{fmtDate(row.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t('prodMovements')}>
              <div className="overflow-x-auto">
                <Table>
                  <TableBody>
                    {(data.recentMovements ?? []).length === 0 ? <TableRow><TableCell className="text-subtle">{t('prodNoData')}</TableCell></TableRow> : (data.recentMovements ?? []).map((row, index) => (
                      <TableRow key={`${row.recordedAt}-${index}`}>
                        <TableCell>{MOVEMENT_KEYS[row.type] ? t(MOVEMENT_KEYS[row.type]) : row.type}</TableCell>
                        <TableCell>{row.sku ?? '—'}</TableCell>
                        <TableCell className={`tabular-nums ${row.quantity < 0 ? 'text-destructive' : 'text-success'}`}>{row.quantity > 0 ? '+' : ''}{number.format(row.quantity)}</TableCell>
                        <TableCell>{fmtDate(row.recordedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <small className="text-caption text-subtle">{t('prodProduced')}: {number.format(kpis.producedUnits)} · {t('prodShipped')}: {number.format(kpis.shippedUnits)}</small>
            </Section>

            <Section title={t('prodProduction')}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>{t('status')}</TableHead><TableHead>{t('prodTarget')}</TableHead><TableHead>{t('prodActual')}</TableHead><TableHead>{t('prodCreated')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(data.production ?? []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-subtle">{t('prodNoData')}</TableCell></TableRow> : (data.production ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.documentNumber}</TableCell>
                        <TableCell><Badge variant={row.status === 'completed' ? 'success' : 'secondary'}>{statusLabel(row.status)}</Badge></TableCell>
                        <TableCell className="tabular-nums">{number.format(row.target)}</TableCell>
                        <TableCell className="tabular-nums">{row.actual === null ? '—' : number.format(row.actual)}</TableCell>
                        <TableCell>{fmtDate(row.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>
          </div>
        </>
      )}

      <Section title={t('prodInfo')}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{t('catSizeLabel')}</TableHead><TableHead>SKU</TableHead><TableHead>{t('catPrice')}</TableHead><TableHead>{t('catStockLink')}</TableHead><TableHead>{t('status')}</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.sizes.length === 0 ? <TableRow><TableCell colSpan={5} className="text-subtle">{t('prodNoData')}</TableCell></TableRow> : data.sizes.map((size) => (
                <TableRow key={size.id}>
                  <TableCell>{formatPackSize(size.size_g)}</TableCell>
                  <TableCell>{size.sku ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{size.sale_price_mad === null ? '—' : mad(Number(size.sale_price_mad))}</TableCell>
                  <TableCell><Badge variant={size.inventory_item_id ? 'success' : 'warning'}>{size.inventory_item_id ? t('stockLinked') : t('stockNotLinked')}</Badge></TableCell>
                  <TableCell><Badge variant={size.is_active ? 'success' : 'secondary'}>{size.is_active ? t('active') : t('inactive')}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <small className="text-caption text-subtle">{t('prodCreated')}: {fmtDate(data.product.created_at)} · {t('prodUpdated')}: {fmtDate(data.product.updated_at)}</small>
      </Section>
    </div>
  );
}
