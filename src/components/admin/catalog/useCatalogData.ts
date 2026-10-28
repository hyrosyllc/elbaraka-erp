'use client';

import { useCallback, useEffect, useState } from 'react';

export type CatalogCategory = { id: string; name_ar: string; name: string; is_active: boolean };
export type CatalogProduct = {
  id: string;
  category_id: string | null;
  name_ar: string;
  name: string;
  stock_unit: 'g' | 'kg';
  is_active: boolean;
};
export type CatalogSize = {
  id: string;
  product_id: string;
  size_g: number | string;
  sku: string | null;
  sale_price_mad: number | string | null;
  inventory_item_id: string | null;
  is_active: boolean;
};
export type CatalogInventoryItem = { id: string; sku: string; name: string; name_ar: string; net_weight_g: number | null };

export type CatalogPayload = {
  categories: CatalogCategory[];
  products: CatalogProduct[];
  sizes: CatalogSize[];
  inventoryItems: CatalogInventoryItem[];
  canManage: boolean;
};

const EMPTY: CatalogPayload = { categories: [], products: [], sizes: [], inventoryItems: [], canManage: false };

export function useCatalogData() {
  const [catalog, setCatalog] = useState<CatalogPayload>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch('/api/admin/catalog', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('catalog');
      setCatalog(await response.json() as CatalogPayload);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const mutate = useCallback(async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/catalog', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'catalog');
    await load();
  }, [load]);

  return { catalog, loading, failed, reload: load, mutate };
}

export function formatPackSize(sizeG: number | string) {
  const grams = Number(sizeG);
  return grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;
}
