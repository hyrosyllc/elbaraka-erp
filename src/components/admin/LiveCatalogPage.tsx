'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ITEM_TYPE_LABELS, type ItemType, type WorkspacePage } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

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

type CatalogItem = {
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

export function LiveCatalogPage({ canManage, onNavigate }: { canManage: boolean; onNavigate: (page: WorkspacePage) => void }) {
  const { t } = useLocale();
  const [rows, setRows] = useState<BalanceRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false);
    try {
      const response = await fetch('/api/operations/inventory', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('catalog');
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
    const byItem = new Map<string, CatalogItem>();
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
      <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-[21px] py-5">
        <p className="m-0 text-xs text-muted-foreground">{t('catalogSubtitle')}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/admin/catalog">{t('productCatalogLink')}</Link></Button>
          {canManage && <Button type="button" size="sm" onClick={() => onNavigate('inventory')}>{t('navInventory')}</Button>}
        </div>
      </Card>
      {failed && (
        <p className="m-0 text-xs text-destructive" role="alert">
          {t('mapLoadError')} <Button type="button" variant="link" onClick={() => void load()}>{t('retry')}</Button>
        </p>
      )}
      {!rows && !failed && <p className="m-0 text-sm text-subtle" role="status">{t('mapLoadingOrders')}</p>}
      {rows && (
        <Card className="overflow-x-auto rounded-[9px] border border-border bg-card">
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
        </Card>
      )}
    </div>
  );
}
