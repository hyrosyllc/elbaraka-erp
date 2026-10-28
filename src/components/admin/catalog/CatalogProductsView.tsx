'use client';

import { FormEvent, useMemo, useState } from 'react';
import { PackagePlus, Pencil, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { formatMad, productPath } from '@/lib/workspace';
import { useLocale } from '../LocaleContext';
import { type CatalogProduct, type CatalogSize, formatPackSize, useCatalogData } from './useCatalogData';

type ProductDraft = { id: string; nameAr: string; name: string; stockUnit: 'g' | 'kg'; categoryId: string | null; isActive: boolean };
type SizeDraft = { id: string; productId: string; value: string; unit: 'g' | 'kg'; sku: string; price: string; isActive: boolean };
type StatusFilter = 'all' | 'active' | 'inactive' | 'unlinked';

const EMPTY_PRODUCT: ProductDraft = { id: '', nameAr: '', name: '', stockUnit: 'g', categoryId: null, isActive: true };

function sizeToDraft(productId: string, size?: CatalogSize): SizeDraft {
  if (!size) return { id: '', productId, value: '', unit: 'g', sku: '', price: '', isActive: true };
  const grams = Number(size.size_g);
  const exactKg = grams >= 1000 && grams % 1000 === 0;
  return {
    id: size.id,
    productId,
    value: String(exactKg ? grams / 1000 : grams),
    unit: exactKg ? 'kg' : 'g',
    sku: size.sku ?? '',
    price: size.sale_price_mad === null ? '' : String(size.sale_price_mad),
    isActive: size.is_active,
  };
}

export function CatalogProductsView({ canManage }: { canManage: boolean }) {
  const { t, locale } = useLocale();
  const { catalog, loading, failed, reload, mutate } = useCatalogData();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [sizeDraft, setSizeDraft] = useState<SizeDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const categoryName = (id: string | null) => {
    const category = catalog.categories.find((candidate) => candidate.id === id);
    return category ? (locale === 'ar' ? category.name_ar : category.name || category.name_ar) : t('uncategorized');
  };
  const productName = (product: CatalogProduct) => (locale === 'ar' ? product.name_ar : product.name || product.name_ar);

  const sizesByProduct = useMemo(() => {
    const map = new Map<string, CatalogSize[]>();
    for (const size of catalog.sizes) map.set(size.product_id, [...(map.get(size.product_id) ?? []), size]);
    return map;
  }, [catalog.sizes]);

  const stats = useMemo(() => {
    const activeSizes = catalog.sizes.filter((size) => size.is_active);
    return {
      products: catalog.products.length,
      active: catalog.products.filter((product) => product.is_active).length,
      sizes: activeSizes.length,
      unlinked: activeSizes.filter((size) => !size.inventory_item_id).length,
    };
  }, [catalog.products, catalog.sizes]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return catalog.products.filter((product) => {
      const sizes = sizesByProduct.get(product.id) ?? [];
      const matchesText = !needle
        || product.name_ar.toLocaleLowerCase().includes(needle)
        || product.name.toLocaleLowerCase().includes(needle)
        || sizes.some((size) => (size.sku ?? '').toLocaleLowerCase().includes(needle));
      const matchesCategory = categoryFilter === 'all'
        || (categoryFilter === 'none' ? product.category_id === null : product.category_id === categoryFilter);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && product.is_active)
        || (statusFilter === 'inactive' && !product.is_active)
        || (statusFilter === 'unlinked' && sizes.some((size) => size.is_active && !size.inventory_item_id));
      return matchesText && matchesCategory && matchesStatus;
    });
  }, [catalog.products, categoryFilter, query, sizesByProduct, statusFilter]);

  const run = async (action: () => Promise<void>, successKey: 'catSavedProduct' | 'catSavedSize' | 'catSavedLink' | 'catStateUpdated') => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(t(successKey));
      return true;
    } catch {
      setError(t('catSaveError'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productDraft) return;
    const editing = Boolean(productDraft.id);
    const ok = await run(() => mutate(editing ? 'PATCH' : 'POST', {
      operation: 'product',
      ...(editing ? { id: productDraft.id, isActive: productDraft.isActive } : {}),
      nameAr: productDraft.nameAr,
      name: productDraft.name,
      stockUnit: productDraft.stockUnit,
      categoryId: productDraft.categoryId,
    }), 'catSavedProduct');
    if (ok) setProductDraft(null);
  };

  const toggleProduct = (product: CatalogProduct) => run(() => mutate('PATCH', {
    operation: 'product',
    id: product.id,
    isActive: !product.is_active,
    nameAr: product.name_ar,
    name: product.name,
    stockUnit: product.stock_unit,
    categoryId: product.category_id,
  }), 'catStateUpdated');

  const saveSize = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sizeDraft) return;
    const editing = Boolean(sizeDraft.id);
    const ok = await run(() => mutate(editing ? 'PATCH' : 'POST', {
      operation: 'size',
      ...(editing ? { id: sizeDraft.id, isActive: sizeDraft.isActive } : { productId: sizeDraft.productId }),
      sizeValue: Number(sizeDraft.value),
      sizeUnit: sizeDraft.unit,
      sku: sizeDraft.sku,
      salePriceMad: sizeDraft.price,
    }), 'catSavedSize');
    if (ok) setSizeDraft(null);
  };

  const toggleSize = (size: CatalogSize) => {
    const draft = sizeToDraft(size.product_id, size);
    return run(() => mutate('PATCH', {
      operation: 'size',
      id: size.id,
      isActive: !size.is_active,
      sizeValue: Number(draft.value),
      sizeUnit: draft.unit,
      sku: size.sku,
      salePriceMad: size.sale_price_mad,
    }), 'catStateUpdated');
  };

  const linkSize = (size: CatalogSize, inventoryItemId: string) => run(() => mutate('PATCH', {
    operation: 'sizeInventory',
    id: size.id,
    inventoryItemId: inventoryItemId === 'none' ? null : inventoryItemId,
  }), 'catSavedLink');

  const createStock = (size: CatalogSize) => run(() => mutate('PATCH', { operation: 'sizeCreateStock', id: size.id }), 'catSavedLink');

  const createAllStock = async () => {
    const targets = catalog.sizes.filter((size) => size.is_active && !size.inventory_item_id && size.sku);
    if (targets.length === 0) return;
    await run(async () => {
      for (const size of targets) await mutate('PATCH', { operation: 'sizeCreateStock', id: size.id });
    }, 'catSavedLink');
  };

  const tiles: [string, number][] = [
    [t('catStatProducts'), stats.products],
    [t('catStatActive'), stats.active],
    [t('catStatSizes'), stats.sizes],
    [t('catStatUnlinked'), stats.unlinked],
  ];

  return (
    <div className="grid gap-[18px]">
      <section className="grid grid-cols-2 overflow-hidden rounded-[9px] border border-border bg-card min-[761px]:grid-cols-4" aria-label={t('catProducts')}>
        {tiles.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b border-e border-divider px-5 py-4">
            <span className="text-label text-subtle">{label}</span>
            <strong className="text-2xl leading-none text-foreground">{value}</strong>
          </div>
        ))}
      </section>

      <Card className="grid gap-3 rounded-[9px] border border-border bg-card p-[21px]">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="flex min-h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 text-muted-foreground">
            <Search size={16} aria-hidden="true" />
            <Input className="h-auto border-0 bg-transparent p-0 text-xs focus-visible:ring-0" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('catSearch')} aria-label={t('catSearch')} />
          </Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="min-w-[170px]" aria-label={t('category')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('catAllCategories')}</SelectItem>
              <SelectItem value="none">{t('uncategorized')}</SelectItem>
              {catalog.categories.filter((category) => category.is_active).map((category) => <SelectItem key={category.id} value={category.id}>{categoryName(category.id)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="min-w-[150px]" aria-label={t('status')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('catAllStatuses')}</SelectItem>
              <SelectItem value="active">{t('active')}</SelectItem>
              <SelectItem value="inactive">{t('inactive')}</SelectItem>
              <SelectItem value="unlinked">{t('stockNotLinked')}</SelectItem>
            </SelectContent>
          </Select>
          {canManage && stats.unlinked > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => void createAllStock()}><PackagePlus size={15} />{t('catCreateAllStock')}</Button>}
          {canManage && <Button type="button" variant="primary" onClick={() => setProductDraft(EMPTY_PRODUCT)}><Plus size={15} />{t('catAddProduct')}</Button>}
        </div>
        {!canManage && <p className="m-0 text-xs text-subtle">{t('catReadOnly')}</p>}
      </Card>

      {error && <p className="m-0 rounded-md border border-destructive/40 bg-destructive-soft p-2.5 text-xs text-destructive" role="alert">{error}</p>}
      {notice && <p className="m-0 rounded-md border border-success/40 bg-secondary p-2.5 text-xs text-secondary-foreground" role="status">{notice}</p>}
      {failed && <p className="m-0 text-xs text-destructive" role="alert">{t('catLoadError')} <Button type="button" variant="link" onClick={() => void reload()}>{t('retry')}</Button></p>}
      {loading && catalog.products.length === 0 && !failed && <p className="m-0 text-sm text-subtle" role="status">{t('catLoading')}</p>}
      {!loading && !failed && visible.length === 0 && <Card className="rounded-[9px] border border-dashed border-border bg-card/70 px-5 py-10 text-center text-sm text-subtle">{t('noCustomerProducts')}</Card>}

      {visible.map((product) => {
        const sizes = sizesByProduct.get(product.id) ?? [];
        return (
          <Card key={product.id} className={`overflow-hidden rounded-[9px] border border-border bg-card ${product.is_active ? '' : 'opacity-75'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider px-[21px] py-4">
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="m-0 break-words text-base font-bold"><Link href={productPath(product.id)} className="text-foreground no-underline hover:text-primary hover:underline">{productName(product)}</Link></h2>
                  <Badge variant={product.is_active ? 'success' : 'secondary'}>{product.is_active ? t('active') : t('inactive')}</Badge>
                </div>
                <p className="m-0 text-label text-subtle">{categoryName(product.category_id)} · {t('catStockUnit')}: {product.stock_unit}</p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setProductDraft({ id: product.id, nameAr: product.name_ar, name: product.name, stockUnit: product.stock_unit, categoryId: product.category_id, isActive: product.is_active })}><Pencil size={14} />{t('catEdit')}</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSizeDraft(sizeToDraft(product.id))}><Plus size={14} />{t('catAddSize')}</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void toggleProduct(product)}>{product.is_active ? t('catDeactivate') : t('catActivate')}</Button>
                </div>
              )}
            </div>
            {sizes.length === 0 ? <p className="m-0 px-[21px] py-4 text-xs text-subtle">{t('catNoSizes')}</p> : (
              <div className="divide-y divide-divider">
                {sizes.map((size) => (
                  <div key={size.id} className={`grid items-center gap-3 px-[21px] py-3 min-[900px]:grid-cols-[90px_minmax(110px,1fr)_100px_minmax(190px,1.4fr)_auto] ${size.is_active ? '' : 'opacity-60'}`}>
                    <strong dir="ltr" className="text-sm">{formatPackSize(size.size_g)}</strong>
                    <span dir="ltr" className="text-xs text-muted-foreground">{size.sku || '—'}</span>
                    <span dir="ltr" className="text-sm font-semibold">{size.sale_price_mad === null ? '—' : formatMad(Number(size.sale_price_mad))}</span>
                    {canManage ? (
                      <Select value={size.inventory_item_id ?? 'none'} onValueChange={(value) => void linkSize(size, value)} disabled={busy}>
                        <SelectTrigger className="w-full" aria-label={t('catStockLink')}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('stockNotLinked')}</SelectItem>
                          {catalog.inventoryItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.sku} · {locale === 'ar' ? item.name_ar || item.name : item.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : <Badge variant={size.inventory_item_id ? 'success' : 'warning'}>{size.inventory_item_id ? t('stockLinked') : t('stockNotLinked')}</Badge>}
                    {canManage && (
                      <div className="flex gap-1">
                        {!size.inventory_item_id && size.is_active && <Button type="button" variant="secondary" size="sm" disabled={busy || !size.sku} title={size.sku ? undefined : t('catStockNeedsSku')} onClick={() => void createStock(size)}><PackagePlus size={14} />{t('catCreateStock')}</Button>}
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSizeDraft(sizeToDraft(product.id, size))}><Pencil size={14} />{t('catEdit')}</Button>
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void toggleSize(size)}>{size.is_active ? t('catDeactivate') : t('catActivate')}</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <Dialog open={productDraft !== null} onOpenChange={(open) => { if (!open) setProductDraft(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{productDraft?.id ? t('catEditProduct') : t('catAddProduct')}</DialogTitle>
            <DialogDescription>{t('catProductHint')}</DialogDescription>
          </DialogHeader>
          {productDraft && (
            <form onSubmit={saveProduct} className="grid gap-4 py-2">
              <Label className="grid gap-2 text-sm font-medium"><span>{t('catNameAr')}</span><Input autoFocus value={productDraft.nameAr} onChange={(event) => setProductDraft({ ...productDraft, nameAr: event.target.value })} maxLength={160} required dir="rtl" /></Label>
              <Label className="grid gap-2 text-sm font-medium"><span>{t('catNameEn')} <small className="text-muted-foreground">{t('catOptional')}</small></span><Input value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} maxLength={160} /></Label>
              <div className="grid gap-2 text-sm font-medium">
                <span>{t('category')}</span>
                <Select value={productDraft.categoryId ?? 'none'} onValueChange={(value) => setProductDraft({ ...productDraft, categoryId: value === 'none' ? null : value })}>
                  <SelectTrigger aria-label={t('category')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('uncategorized')}</SelectItem>
                    {catalog.categories.filter((category) => category.is_active || category.id === productDraft.categoryId).map((category) => <SelectItem key={category.id} value={category.id}>{categoryName(category.id)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 text-sm font-medium">
                <span>{t('catStockUnit')}</span>
                <Select value={productDraft.stockUnit} onValueChange={(value) => setProductDraft({ ...productDraft, stockUnit: value as 'g' | 'kg' })}>
                  <SelectTrigger aria-label={t('catStockUnit')}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="g">g</SelectItem><SelectItem value="kg">kg</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setProductDraft(null)}>{t('cancel')}</Button>
                <Button type="submit" variant="primary" disabled={busy}>{busy ? t('saving') : t('catSave')}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sizeDraft !== null} onOpenChange={(open) => { if (!open) setSizeDraft(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{sizeDraft?.id ? t('catEditSize') : t('catAddSize')}</DialogTitle>
            <DialogDescription>{sizeDraft ? productName(catalog.products.find((product) => product.id === sizeDraft.productId) ?? { name: '', name_ar: '' } as CatalogProduct) : ''}</DialogDescription>
          </DialogHeader>
          {sizeDraft && (
            <form onSubmit={saveSize} className="grid gap-4 py-2">
              <div className="grid gap-2 text-sm font-medium">
                <span>{t('catSizeLabel')}</span>
                <div className="flex gap-2">
                  <Input className="min-w-0 flex-1" type="number" min="0.001" step="0.001" value={sizeDraft.value} onChange={(event) => setSizeDraft({ ...sizeDraft, value: event.target.value })} required aria-label={t('catSizeLabel')} dir="ltr" />
                  <Select value={sizeDraft.unit} onValueChange={(value) => setSizeDraft({ ...sizeDraft, unit: value as 'g' | 'kg' })}>
                    <SelectTrigger className="w-24" aria-label={t('catStockUnit')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="g">g</SelectItem><SelectItem value="kg">kg</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <Label className="grid gap-2 text-sm font-medium"><span>{t('catSku')} <small className="text-muted-foreground">{t('catOptional')}</small></span><Input value={sizeDraft.sku} onChange={(event) => setSizeDraft({ ...sizeDraft, sku: event.target.value.toUpperCase() })} maxLength={64} dir="ltr" /></Label>
              <Label className="grid gap-2 text-sm font-medium"><span>{t('catPrice')} <small className="text-muted-foreground">{t('catOptional')}</small></span><Input type="number" min="0" step="0.01" value={sizeDraft.price} onChange={(event) => setSizeDraft({ ...sizeDraft, price: event.target.value })} dir="ltr" /></Label>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setSizeDraft(null)}>{t('cancel')}</Button>
                <Button type="submit" variant="primary" disabled={busy}>{busy ? t('saving') : t('catSave')}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
