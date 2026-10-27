'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LogOut, PackagePlus, Pencil, Plus, RefreshCw, Search, Tags, UsersRound, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

type CatalogCategory = {
  id: string;
  name_ar: string;
  name: string;
  is_active: boolean;
};

type CatalogProduct = {
  id: string;
  category_id: string | null;
  name_ar: string;
  name: string;
  stock_unit: 'g' | 'kg';
  is_active: boolean;
};

type CatalogSize = {
  id: string;
  product_id: string;
  size_g: number;
  sku: string | null;
  sale_price_mad: number | null;
  inventory_item_id: string | null;
  is_active: boolean;
};

type CatalogInventoryItem = {
  id: string;
  sku: string;
  name: string;
  name_ar: string;
  net_weight_g: number | null;
};

type CatalogPayload = {
  categories: CatalogCategory[];
  products: CatalogProduct[];
  sizes: CatalogSize[];
  inventoryItems: CatalogInventoryItem[];
  canManage: boolean;
};

type ProductDraft = Pick<CatalogProduct, 'name_ar' | 'name' | 'stock_unit' | 'category_id'>;
type SizeDraft = { sizeValue: string; sizeUnit: 'g' | 'kg'; sku: string; salePriceMad: string };
type CategoryDraft = { id: string; nameAr: string; name: string; isActive: boolean };

const emptyProduct: ProductDraft = { name_ar: '', name: '', stock_unit: 'g', category_id: null };
const emptySize: SizeDraft = { sizeValue: '', sizeUnit: 'g', sku: '', salePriceMad: '' };

export function CatalogManagement({ canManage, fullName }: { canManage: boolean; fullName: string }) {
  const [catalog, setCatalog] = useState<CatalogPayload>({
    categories: [],
    products: [],
    sizes: [],
    inventoryItems: [],
    canManage,
  });
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [productDialog, setProductDialog] = useState<CatalogProduct | null | false>(false);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProduct);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>({ id: '', nameAr: '', name: '', isActive: true });
  const [sizeDialog, setSizeDialog] = useState<{ productId: string; size: CatalogSize | null } | null>(null);
  const [sizeDraft, setSizeDraft] = useState<SizeDraft>(emptySize);
  const [signingOut, setSigningOut] = useState(false);

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/catalog', { cache: 'no-store', signal });
      const payload = await response.json() as CatalogPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'تعذر تحميل دليل المنتجات.');
      setCatalog(payload);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل دليل المنتجات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadCatalog(controller.signal);
    return () => controller.abort();
  }, [loadCatalog]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return catalog.products.filter((product) => {
      const matchesQuery = !normalizedQuery
        || product.name_ar.toLocaleLowerCase().includes(normalizedQuery)
        || product.name.toLocaleLowerCase().includes(normalizedQuery);
      const matchesCategory = !categoryFilter
        || (categoryFilter === 'uncategorized' ? product.category_id === null : product.category_id === categoryFilter);
      return matchesQuery && matchesCategory;
    });
  }, [catalog.products, categoryFilter, query]);

  const request = async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/catalog', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'تعذر حفظ التغييرات.');
    await loadCatalog();
  };

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const editing = Boolean(categoryDraft.id);
      await request(editing ? 'PATCH' : 'POST', {
        operation: 'category',
        ...(editing ? { id: categoryDraft.id, isActive: categoryDraft.isActive } : {}),
        nameAr: categoryDraft.nameAr,
        name: categoryDraft.name,
      });
      setCategoryDraft({ id: '', nameAr: '', name: '', isActive: true });
      setNotice(editing ? 'تم تحديث التصنيف.' : 'تم إنشاء التصنيف.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ التصنيف.');
    } finally {
      setBusy(false);
    }
  };

  const toggleCategory = async (category: CatalogCategory) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request('PATCH', { operation: 'category', id: category.id, isActive: !category.is_active, nameAr: category.name_ar, name: category.name });
      setNotice(category.is_active ? 'تم إيقاف التصنيف.' : 'تم تفعيل التصنيف.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث التصنيف.');
    } finally {
      setBusy(false);
    }
  };

  const openProduct = (product?: CatalogProduct) => {
    setProductDialog(product ?? null);
    setProductDraft(product
      ? { name_ar: product.name_ar, name: product.name, stock_unit: product.stock_unit, category_id: product.category_id }
      : emptyProduct);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const editingProduct = productDialog || null;
      const editing = editingProduct !== null;
      await request(editing ? 'PATCH' : 'POST', {
        operation: 'product',
        ...(editingProduct ? { id: editingProduct.id, isActive: editingProduct.is_active } : {}),
        nameAr: productDraft.name_ar,
        name: productDraft.name,
        stockUnit: productDraft.stock_unit,
        categoryId: productDraft.category_id,
      });
      setProductDialog(false);
      setNotice(editing ? 'تم تحديث المنتج.' : 'تمت إضافة المنتج.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ المنتج.');
    } finally {
      setBusy(false);
    }
  };

  const toggleProduct = async (product: CatalogProduct) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request('PATCH', {
        operation: 'product',
        id: product.id,
        isActive: !product.is_active,
        nameAr: product.name_ar,
        name: product.name,
        stockUnit: product.stock_unit,
        categoryId: product.category_id,
      });
      setNotice(product.is_active ? 'تم إيقاف المنتج.' : 'تم تفعيل المنتج.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث المنتج.');
    } finally {
      setBusy(false);
    }
  };

  const openSize = (productId: string, size?: CatalogSize) => {
    setSizeDialog({ productId, size: size ?? null });
    setSizeDraft(size
      ? { sizeValue: String(Number(size.size_g) >= 1000 && Number(size.size_g) % 1000 === 0 ? Number(size.size_g) / 1000 : size.size_g), sizeUnit: Number(size.size_g) >= 1000 && Number(size.size_g) % 1000 === 0 ? 'kg' : 'g', sku: size.sku ?? '', salePriceMad: size.sale_price_mad === null ? '' : String(size.sale_price_mad) }
      : emptySize);
  };

  const saveSize = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sizeDialog) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const editing = Boolean(sizeDialog.size);
      await request(editing ? 'PATCH' : 'POST', {
        operation: 'size',
        ...(editing ? { id: sizeDialog.size?.id, isActive: sizeDialog.size?.is_active } : { productId: sizeDialog.productId }),
        sizeValue: Number(sizeDraft.sizeValue),
        sizeUnit: sizeDraft.sizeUnit,
        sku: sizeDraft.sku,
        salePriceMad: sizeDraft.salePriceMad,
      });
      setSizeDialog(null);
      setNotice(editing ? 'تم تحديث الحجم.' : 'تمت إضافة الحجم.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الحجم.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSize = async (size: CatalogSize) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const exactKg = Number(size.size_g) % 1000 === 0;
      await request('PATCH', {
        operation: 'size',
        id: size.id,
        isActive: !size.is_active,
        sizeValue: exactKg ? Number(size.size_g) / 1000 : Number(size.size_g),
        sizeUnit: exactKg ? 'kg' : 'g',
        sku: size.sku,
        salePriceMad: size.sale_price_mad,
      });
      setNotice(size.is_active ? 'تم إيقاف الحجم.' : 'تم تفعيل الحجم.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الحجم.');
    } finally {
      setBusy(false);
    }
  };

  const updateInventoryMapping = async (size: CatalogSize, inventoryItemId: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request('PATCH', {
        operation: 'sizeInventory',
        id: size.id,
        inventoryItemId: inventoryItemId === 'unmapped' ? null : inventoryItemId,
      });
      setNotice('تم تحديث ربط الحجم بالمخزون.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث ربط المخزون.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true); setError('');
    try {
      const { error: signOutError } = await getSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      window.location.assign('/login');
    } catch {
      setError('تعذر تسجيل الخروج. حاول مرة أخرى.');
      setSigningOut(false);
    }
  };

  const categoryName = (categoryId: string | null) => catalog.categories.find((category) => category.id === categoryId)?.name_ar ?? 'بدون تصنيف';
  const formattedSize = (sizeG: number) => Number(sizeG) >= 1000 && Number(sizeG) % 1000 === 0
    ? `${Number(sizeG) / 1000} كغ`
    : `${new Intl.NumberFormat('ar-MA', { maximumFractionDigits: 3 }).format(Number(sizeG))} غ`;

  return <main className="min-h-screen bg-background text-foreground" dir="rtl" lang="ar">
    <header className="flex min-h-[76px] items-center justify-between gap-5 border-b border-border bg-surface px-[clamp(18px,5vw,72px)] max-[760px]:min-h-[68px] max-[760px]:px-4 max-[480px]:flex-wrap max-[480px]:px-3 max-[480px]:py-2.5">
      <div className="flex items-center gap-3"><span className="relative flex size-[34px] -rotate-[5deg] items-center justify-center gap-0.5 overflow-hidden rounded-[9px_9px_9px_3px] bg-primary" aria-hidden="true"><span className="h-[13px] w-1 rotate-[24deg] rounded-full bg-accent-border" /><span className="h-[18px] w-1 rotate-[24deg] rounded-full bg-accent" /><span className="h-[11px] w-1 rotate-[24deg] rounded-full bg-saffron" /></span><div className="grid gap-[3px]"><strong className="text-[15px] text-primary-deep">البركة للتوابل</strong><small className="text-xs text-subtle">إدارة دليل المنتجات</small></div></div>
      <div className="flex items-center gap-3 max-[760px]:gap-2"><span className="text-xs text-subtle max-[760px]:hidden">{fullName}</span>{canManage && <Button asChild variant="outline" size="sm"><Link href="/admin/users" className="no-underline"><UsersRound size={15} />إدارة المستخدمين</Link></Button>}<Button type="button" variant="outline" size="sm" onClick={signOut} disabled={signingOut}><LogOut size={15} />{signingOut ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</Button></div>
    </header>

    <div className="mx-auto grid w-[min(1120px,calc(100%_-_36px))] gap-[18px] py-[34px] pb-16 max-[760px]:w-[calc(100%_-_28px)] max-[760px]:gap-[13px] max-[760px]:pt-[22px]">
      <section className="flex items-end justify-between gap-5 px-0.5 py-2 max-[480px]:items-start">
        <div><p className="text-xs font-bold text-primary">الكتالوج</p><h1 className="my-[7px] text-[clamp(26px,4vw,38px)] font-bold tracking-[-.8px] text-primary-deep">دليل المنتجات</h1><p className="m-0 text-[13px] text-subtle max-[480px]:max-w-[250px] max-[480px]:leading-[1.6]">أسماء المنتجات محفوظة كما وردت. أضف التصنيفات والأحجام عندما تكون جاهزة.</p></div>
        <div className="grid min-w-[84px] justify-items-center gap-[3px] rounded-[7px] bg-secondary px-4 py-3 text-primary"><strong className="text-2xl leading-none">{catalog.products.length}</strong><span className="text-label text-muted-foreground">منتج</span></div>
      </section>

      <Card className="p-[22px] max-[760px]:px-[13px] max-[760px]:py-4">
        <div className="mb-4 flex items-center justify-between gap-4"><div><p className="text-xs font-bold text-primary">التصنيفات</p><h2 className="text-lg font-bold">تنظيم المنتجات</h2></div><Tags size={20} /></div>
        <form className="grid grid-cols-[minmax(180px,1fr)_minmax(160px,.8fr)_auto_auto] items-end gap-[11px] border-b border-divider pb-[17px] max-[760px]:grid-cols-2" onSubmit={saveCategory}>
          <Label className="grid gap-2 text-sm font-medium"><span>اسم التصنيف بالعربية</span><Input value={categoryDraft.nameAr} onChange={(event) => setCategoryDraft((current) => ({ ...current, nameAr: event.target.value }))} maxLength={120} required /></Label>
          <Label className="grid gap-2 text-sm font-medium"><span>الاسم بالإنجليزية <small className="text-muted-foreground">اختياري</small></span><Input value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))} maxLength={120} /></Label>
          <Button variant="primary" type="submit" className="max-[760px]:w-full" disabled={!canManage || busy}><Plus size={15} />{categoryDraft.id ? 'حفظ التصنيف' : 'إضافة تصنيف'}</Button>
          {categoryDraft.id && <Button type="button" variant="outline" className="max-[760px]:w-full" onClick={() => setCategoryDraft({ id: '', nameAr: '', name: '', isActive: true })}>إلغاء</Button>}
        </form>
        <div className="grid pt-[5px]">
          {catalog.categories.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تصنيفات بعد. يمكنك إنشاء أول تصنيف هنا.</p> : catalog.categories.map((category) => <div className="flex min-h-[52px] items-center gap-3 border-b border-divider" key={category.id}>
            <Button type="button" className="grid flex-1 justify-items-start gap-0.5 border-0 bg-transparent py-[7px] text-right" onClick={() => setCategoryDraft({ id: category.id, nameAr: category.name_ar, name: category.name, isActive: category.is_active })} disabled={!canManage}><strong className="text-[13px]">{category.name_ar}</strong>{category.name && <span className="text-label text-subtle">{category.name}</span>}</Button>
            <Badge variant={category.is_active ? 'success' : 'secondary'}>{category.is_active ? 'نشط' : 'متوقف'}</Badge>
            {canManage && <Button type="button" variant="ghost" className="whitespace-nowrap" onClick={() => void toggleCategory(category)} disabled={busy}>{category.is_active ? 'إيقاف' : 'تفعيل'}</Button>}
          </div>)}
        </div>
      </Card>

      <Card className="p-[22px] max-[760px]:px-[13px] max-[760px]:py-4">
        <div className="mb-4 flex items-center justify-between gap-4"><div><p className="text-xs font-bold text-primary">المنتجات</p><h2 className="text-lg font-bold">قائمة المنتجات</h2></div>
          <div className="flex items-center gap-3 max-[480px]:gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void loadCatalog()} disabled={loading || busy}><RefreshCw size={15} />تحديث</Button>{canManage && <Button type="button" variant="primary" size="sm" onClick={() => openProduct()}><PackagePlus size={16} />إضافة منتج</Button>}</div>
        </div>
        {!canManage && <p className="mb-[15px] border-r-[3px] border-saffron bg-background px-3 py-2.5 text-xs text-muted-foreground">يمكنك عرض دليل المنتجات. تعديل المنتجات والتصنيفات متاح للمدير فقط.</p>}
        <div className="mb-2 grid grid-cols-[minmax(200px,1fr)_minmax(180px,.5fr)] gap-[11px] max-[480px]:grid-cols-1">
          <Label className="flex min-h-10 w-full items-center gap-2 rounded-md border bg-background px-3 text-muted-foreground"><Search size={16} /><Input className="h-auto border-0 bg-transparent p-0 text-label focus-visible:ring-0" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم المنتج" /></Label>
          <Select value={categoryFilter || 'all'} onValueChange={(value) => setCategoryFilter(value === 'all' ? '' : value)}>
            <SelectTrigger aria-label="تصفية حسب التصنيف"><SelectValue placeholder="كل التصنيفات" /></SelectTrigger>
            <SelectContent><SelectItem value="all">كل التصنيفات</SelectItem><SelectItem value="uncategorized">بدون تصنيف</SelectItem>{catalog.categories.filter((category) => category.is_active).map((category) => <SelectItem key={category.id} value={category.id}>{category.name_ar}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {error && <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
        {notice && <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary" role="status">{notice}</p>}
        {loading ? <p className="py-6 text-center text-sm text-muted-foreground">جارٍ تحميل المنتجات…</p> : visibleProducts.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">لا توجد منتجات مطابقة لهذا البحث.</p> : <div className="border-t border-divider">
          {visibleProducts.map((product) => {
            const productSizes = catalog.sizes.filter((size) => size.product_id === product.id);
            return <article className={`grid grid-cols-[minmax(180px,1fr)_minmax(220px,1.15fr)_auto] items-center gap-[18px] border-b border-divider px-0.5 py-4 max-[760px]:grid-cols-1 max-[760px]:gap-2.5 max-[760px]:py-3.5 ${!product.is_active ? 'opacity-[.62]' : ''}`} key={product.id}>
              <div className="grid min-w-0 gap-1"><strong className="break-words text-sm">{product.name_ar}</strong>{product.name && <span className="text-label text-subtle">{product.name}</span>}<small className="text-label text-subtle">{categoryName(product.category_id)} · وحدة المخزون {product.stock_unit === 'g' ? 'غرام' : 'كيلوغرام'} {!product.is_active && <Badge className="ms-1" variant="secondary">متوقف</Badge>}</small></div>
              <div className="flex flex-wrap gap-1.5">{productSizes.length === 0 ? <span className="text-label text-subtle">لم تحدد الأحجام</span> : productSizes.map((size) => <div className="grid min-h-7 items-center gap-1.5 rounded border border-border bg-muted px-[7px] py-[5px] text-label text-success" key={size.id}><div className="flex items-center gap-1.5"><span>{formattedSize(size.size_g)}</span>{size.sku && <small className="text-micro text-subtle">{size.sku}</small>}{size.sale_price_mad !== null && <small className="text-micro text-subtle">{Number(size.sale_price_mad).toFixed(2)} د.م</small>}{canManage && <><Button className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0.5 text-muted-foreground" type="button" aria-label={`تعديل ${formattedSize(size.size_g)}`} onClick={() => openSize(product.id, size)}><Pencil size={12} /></Button><Button className="cursor-pointer border-0 bg-transparent p-0.5 text-micro text-muted-foreground" type="button" onClick={() => void toggleSize(size)} disabled={busy}>{size.is_active ? 'إيقاف' : 'تفعيل'}</Button></>}</div>{canManage && <Select value={size.inventory_item_id ?? 'unmapped'} onValueChange={(value) => void updateInventoryMapping(size, value)} disabled={busy}><SelectTrigger className="!h-8 !min-h-8 !w-[190px] text-caption" aria-label={`ربط ${formattedSize(size.size_g)} بصنف المخزون`}><SelectValue placeholder="اربط بصنف مخزون" /></SelectTrigger><SelectContent><SelectItem value="unmapped">غير مربوط بالمخزون</SelectItem>{catalog.inventoryItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.sku} · {item.name_ar || item.name}</SelectItem>)}</SelectContent></Select>}</div>)}</div>
              {canManage && <div className="flex flex-wrap justify-start gap-x-2.5 gap-y-1"><Button variant="ghost" size="sm" type="button" onClick={() => openProduct(product)}><Pencil size={14} />تعديل</Button><Button variant="ghost" size="sm" type="button" onClick={() => openSize(product.id)}><Plus size={14} />إضافة حجم</Button><Button variant="ghost" size="sm" type="button" onClick={() => void toggleProduct(product)} disabled={busy}>{product.is_active ? 'إيقاف' : 'تفعيل'}</Button></div>}
            </article>;
          })}
        </div>}
      </Card>
    </div>

    <Dialog open={productDialog !== false} onOpenChange={(open) => { if (!open) setProductDialog(false); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="flex-row items-center justify-between text-right"><div><p className="text-xs font-bold text-primary">دليل المنتجات</p><DialogTitle id="catalog-product-title">{productDialog ? 'تعديل منتج' : 'إضافة منتج'}</DialogTitle><DialogDescription className="sr-only">تحرير اسم المنتج ووحدة المخزون والتصنيف.</DialogDescription></div><Button type="button" variant="ghost" size="icon" aria-label="إغلاق" onClick={() => setProductDialog(false)}><X size={18} /></Button></DialogHeader>
        <form onSubmit={saveProduct}><div className="grid gap-4 py-4">
          <Label className="grid gap-2 text-sm font-medium"><span>اسم المنتج بالعربية</span><Input autoFocus value={productDraft.name_ar} onChange={(event) => setProductDraft((current) => ({ ...current, name_ar: event.target.value }))} maxLength={160} required /></Label>
          <Label className="grid gap-2 text-sm font-medium"><span>اسم إضافي</span><Input value={productDraft.name} onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))} maxLength={160} /></Label>
          <Label className="grid gap-2 text-sm font-medium"><span>التصنيف</span><Select value={productDraft.category_id ?? 'uncategorized'} onValueChange={(value) => setProductDraft((current) => ({ ...current, category_id: value === 'uncategorized' ? null : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="uncategorized">بدون تصنيف</SelectItem>{catalog.categories.filter((category) => category.is_active || category.id === productDraft.category_id).map((category) => <SelectItem key={category.id} value={category.id}>{category.name_ar}{!category.is_active ? ' (متوقف)' : ''}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="grid gap-2 text-sm font-medium"><span>وحدة المخزون</span><Select value={productDraft.stock_unit} onValueChange={(value) => setProductDraft((current) => ({ ...current, stock_unit: value as 'g' | 'kg' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="g">غرام (g)</SelectItem><SelectItem value="kg">كيلوغرام (kg)</SelectItem></SelectContent></Select></Label>
        </div><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setProductDialog(false)}>إلغاء</Button><Button variant="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ المنتج'}</Button></div></form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(sizeDialog)} onOpenChange={(open) => { if (!open) setSizeDialog(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="flex-row items-center justify-between text-right"><div><p className="text-xs font-bold text-primary">{sizeDialog && catalog.products.find((product) => product.id === sizeDialog.productId)?.name_ar}</p><DialogTitle id="catalog-size-title">{sizeDialog?.size ? 'تعديل الحجم' : 'إضافة حجم'}</DialogTitle><DialogDescription className="sr-only">تحديد وزن المنتج ورمزه وسعره.</DialogDescription></div><Button type="button" variant="ghost" size="icon" aria-label="إغلاق" onClick={() => setSizeDialog(null)}><X size={18} /></Button></DialogHeader>
        <form onSubmit={saveSize}><div className="grid gap-4 py-4">
          <Label className="grid gap-2 text-sm font-medium"><span>الحجم</span><span className="flex items-stretch"><Input className="min-w-0 flex-1 rounded-l-none" type="number" min="0.001" step="0.001" value={sizeDraft.sizeValue} onChange={(event) => setSizeDraft((current) => ({ ...current, sizeValue: event.target.value }))} required /><Select value={sizeDraft.sizeUnit} onValueChange={(value) => setSizeDraft((current) => ({ ...current, sizeUnit: value as 'g' | 'kg' }))}><SelectTrigger className="h-10 min-h-10 w-auto rounded-r-none border-l-0 bg-muted px-2.5" aria-label="وحدة الحجم"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="g">غ</SelectItem><SelectItem value="kg">كغ</SelectItem></SelectContent></Select></span></Label>
          <Label className="grid gap-2 text-sm font-medium"><span>رمز المنتج <small className="text-muted-foreground">اختياري</small></span><Input value={sizeDraft.sku} onChange={(event) => setSizeDraft((current) => ({ ...current, sku: event.target.value.toUpperCase() }))} maxLength={40} /></Label>
          <Label className="grid gap-2 text-sm font-medium"><span>سعر البيع بالدرهم <small className="text-muted-foreground">اختياري</small></span><Input type="number" min="0" step="0.01" value={sizeDraft.salePriceMad} onChange={(event) => setSizeDraft((current) => ({ ...current, salePriceMad: event.target.value }))} /></Label>
        </div><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setSizeDialog(null)}>إلغاء</Button><Button variant="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الحجم'}</Button></div></form>
      </DialogContent>
    </Dialog>
  </main>;
}
