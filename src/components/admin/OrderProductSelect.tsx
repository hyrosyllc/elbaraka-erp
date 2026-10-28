'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

export type OrderProduct = {
  sizeId: string;
  itemId: string | null;
  sku: string;
  name: string;
  priceMad: number;
  available: number;
  stock: 'in_stock' | 'out_of_stock' | 'not_linked';
  production: 'none' | 'producible' | 'no_recipe' | 'raw_short';
  rawGaps: { itemId: string; sku: string; name: string; missing: number }[];
};

export function stockLabel(product: OrderProduct, t: ReturnType<typeof useLocale>['t']) {
  if (product.stock === 'in_stock') return `${t('opInStock')}: ${product.available}`;
  if (product.stock === 'not_linked') return t('opNoStockItem');
  return t('opOutOfStock');
}

// Flags a draft line that cannot be filled from stock, so production or purchasing can react.
export function ProductNotice({ product }: { product: OrderProduct | undefined }) {
  const { t } = useLocale();
  if (!product || product.stock === 'in_stock') return null;
  const message = product.production === 'raw_short'
    ? `${t('opNeedsProduction')} ${t('opRawShort')}: ${product.rawGaps.map((gap) => `${gap.name} (−${gap.missing})`).join(', ')}`
    : product.production === 'producible'
      ? `${t('opNeedsProduction')} ${t('opRawOk')}`
      : t('opNoRecipe');
  return <p className="m-0 rounded-md border border-warning/40 bg-warning/10 p-2 text-caption text-foreground" role="status">{product.name}: {stockLabel(product, t)}. {message}</p>;
}

export function OrderProductSelect({ products, value, onChange }: { products: OrderProduct[]; value: string; onChange: (sizeId: string) => void }) {
  const { t, locale } = useLocale();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={t('orderProduct')}><SelectValue placeholder={t('selectProduct')} /></SelectTrigger>
      <SelectContent>
        {products.map((product) => (
          <SelectItem key={product.sizeId} value={product.sizeId}>
            {product.name} · {formatMad(product.priceMad, locale)} · {stockLabel(product, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
