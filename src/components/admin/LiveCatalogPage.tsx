'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CATALOG_SUBPAGES, ITEM_TYPE_LABELS, type CatalogSubpage, type ItemType, workspacePath } from '@/lib/workspace';
import { useLocale } from './LocaleContext';
import { CatalogCategoriesView } from './catalog/CatalogCategoriesView';
import { CatalogProductsView } from './catalog/CatalogProductsView';

type BalanceRow = {
  item_id: string;
  sku: string;
  name: string;
  item_type: ItemType;
  base_unit: string;
  reorder_point: number | string;
  is_active: boolean;
  on_hand: number | string;
  available: number | string;
};

type StockItem = {
  id: string;
  sku: string;
  name: string;
  type: ItemType;
  unit: string;
  reorderPoint: number;
  onHand: number;
  available: number;
  active: boolean;
};

const TAB_KEYS = { products: 'catProducts', categories: 'catCategories', stock: 'catStock' } as const;

function CatalogStockView({ canManage }: { canManage: boolean }) {
  const { t } = useLocale();
  const [rows, setRows] = useState<BalanceRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false);
    try {
      const response = await fetch('/api/operations/inventory', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('inventory');
      const body = await response.json() as { balances: BalanceRow[] };
      setRows(body.balances);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const items = useMemo(() => {
    const byItem = new Map<string, StockItem>();
    for (const row of rows ?? []) {
      const entry = byItem.get(row.item_id) ?? {
        id: row.item_id,
        sku: row.sku,
        name: row.name,
        type: row.item_type,
        unit: row.base_unit,
        reorderPoint: Number(row.reorder_point),
        onHand: 0,
        available: 0,
        active: row.is_active,
      };
      entry.onHand += Number(row.on_hand);
      entry.available += Number(row.available);
      byItem.set(row.item_id, entry);
    }
    return [...byItem.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [rows]);

  return (
    <div className="grid gap-[18px]">
      {canManage && (
        <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-[21px] py-4">
          <p className="m-0 text-xs text-muted-foreground">{t('stockItemsHint')}</p>
          <Button asChild variant="outline" size="sm"><Link href="/staff/inventory">{t('navInventory')}</Link></Button>
        </Card>
      )}
      {failed && (
        <p className="m-0 text-xs text-destructive" role="alert">
          {t('catLoadError')} <Button type="button" variant="link" onClick={() => void load()}>{t('retry')}</Button>
        </p>
      )}
      {!rows && !failed && <p className="m-0 text-sm text-subtle" role="status">{t('catLoading')}</p>}
      {rows && (
        <Card className="overflow-x-auto rounded-[9px] border border-border bg-card">
          {items.length === 0 ? <p className="px-[21px] py-8 text-center text-sm text-subtle">{t('stockItemsEmpty')}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>{t('item')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('onHand')}</TableHead>
                  <TableHead>{t('available')}</TableHead>
                  <TableHead>{t('reorderPoint')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell dir="ltr">{item.sku}</TableCell>
                    <TableCell><strong>{item.name}</strong> <small className="text-subtle">{ITEM_TYPE_LABELS[item.type]}</small></TableCell>
                    <TableCell><Badge variant={item.active ? 'secondary' : 'outline'}>{item.active ? t('active') : t('inactive')}</Badge></TableCell>
                    <TableCell dir="ltr">{item.onHand} {item.unit}</TableCell>
                    <TableCell dir="ltr">{item.available} {item.unit}</TableCell>
                    <TableCell dir="ltr">{item.reorderPoint}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

export function LiveCatalogPage({ canManage, subpage }: { canManage: boolean; subpage: string | null }) {
  const { t } = useLocale();
  const current: CatalogSubpage = (CATALOG_SUBPAGES as readonly string[]).includes(subpage ?? '') ? subpage as CatalogSubpage : 'products';

  return (
    <div className="grid gap-[18px]">
      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label={t('navCatalog')}>
        {CATALOG_SUBPAGES.map((entry) => (
          <Link
            key={entry}
            href={workspacePath('catalog', entry === 'products' ? undefined : entry)}
            aria-current={current === entry ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-xs font-bold no-underline transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50 ${current === entry ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
          >
            {t(TAB_KEYS[entry])}
          </Link>
        ))}
      </nav>
      {current === 'products' && <CatalogProductsView canManage={canManage} />}
      {current === 'categories' && <CatalogCategoriesView canManage={canManage} />}
      {current === 'stock' && <CatalogStockView canManage={canManage} />}
    </div>
  );
}
