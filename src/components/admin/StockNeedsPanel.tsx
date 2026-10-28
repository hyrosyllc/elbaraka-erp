'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from './LocaleContext';

type Need = {
  itemId: string; sku: string; name: string; ordered: number; available: number; short: number; orders: string[];
  state: 'producible' | 'no_recipe' | 'raw_short'; rawGaps: { itemId: string; sku: string; name: string; missing: number }[];
};

export function StockNeedsPanel() {
  const { t } = useLocale();
  const [needs, setNeeds] = useState<Need[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/operations/stock-needs', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() as Promise<{ needs: Need[] }> : null))
      .then((result) => { if (active) setNeeds(result?.needs ?? []); })
      .catch(() => { if (active) setNeeds([]); });
    return () => { active = false; };
  }, []);

  if (needs === null) return null;
  return (
    <Card className="grid gap-2 p-4">
      <div><h3 className="m-0 text-sm font-bold text-foreground">{t('stockNeedsTitle')}</h3><p className="m-0 mt-1 text-xs text-subtle">{t('stockNeedsHint')}</p></div>
      {needs.length === 0 ? <p className="m-0 text-xs text-subtle">{t('stockNeedsNone')}</p> : (
        <div className="grid gap-2">
          {needs.map((need) => (
            <div key={need.itemId} className="grid gap-1 rounded-md border border-border p-3 text-xs">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <strong>{need.name} <span className="font-normal text-subtle" dir="ltr">{need.sku}</span></strong>
                <Badge variant={need.state === 'producible' ? 'success' : 'warning'}>
                  {need.state === 'producible' ? t('stockNeedsProduce') : need.state === 'raw_short' ? t('stockNeedsRaw') : t('stockNeedsNoRecipe')}
                </Badge>
              </span>
              <span className="text-subtle">{t('stockNeedsOrdered')}: {need.ordered} · {t('opInStock')}: {need.available} · <strong className="text-destructive">{t('stockNeedsShort')}: {need.short}</strong> · {need.orders.join(', ')}</span>
              {need.rawGaps.length > 0 && <span className="text-foreground">{need.rawGaps.map((gap) => `${gap.name}: −${gap.missing}`).join(' · ')}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
