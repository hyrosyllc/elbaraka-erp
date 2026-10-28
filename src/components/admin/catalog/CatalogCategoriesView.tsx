'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLocale } from '../LocaleContext';
import { type CatalogCategory, useCatalogData } from './useCatalogData';

type Draft = { id: string; nameAr: string; name: string; isActive: boolean };
const EMPTY_DRAFT: Draft = { id: '', nameAr: '', name: '', isActive: true };

export function CatalogCategoriesView({ canManage }: { canManage: boolean }) {
  const { t } = useLocale();
  const { catalog, loading, failed, reload, mutate } = useCatalogData();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const product of catalog.products) {
      if (product.category_id) result.set(product.category_id, (result.get(product.category_id) ?? 0) + 1);
    }
    return result;
  }, [catalog.products]);
  const uncategorized = catalog.products.filter((product) => !product.category_id).length;

  const run = async (action: () => Promise<void>, successKey: 'catSavedCategory' | 'catStateUpdated') => {
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

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    const editing = Boolean(draft.id);
    const ok = await run(() => mutate(editing ? 'PATCH' : 'POST', {
      operation: 'category',
      ...(editing ? { id: draft.id, isActive: draft.isActive } : {}),
      nameAr: draft.nameAr,
      name: draft.name,
    }), 'catSavedCategory');
    if (ok) setDraft(null);
  };

  const toggle = (category: CatalogCategory) => run(() => mutate('PATCH', {
    operation: 'category',
    id: category.id,
    isActive: !category.is_active,
    nameAr: category.name_ar,
    name: category.name,
  }), 'catStateUpdated');

  return (
    <div className="grid gap-[18px]">
      <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-[21px] py-4">
        <p className="m-0 text-xs text-muted-foreground">{catalog.categories.length} {t('catCategories')} · {uncategorized} {t('catUncategorizedProducts')}</p>
        {canManage
          ? <Button type="button" variant="primary" size="sm" onClick={() => setDraft(EMPTY_DRAFT)}><Plus size={15} />{t('catAddCategory')}</Button>
          : <p className="m-0 text-xs text-subtle">{t('catReadOnly')}</p>}
      </Card>
      {error && <p className="m-0 rounded-md border border-destructive/40 bg-destructive-soft p-2.5 text-xs text-destructive" role="alert">{error}</p>}
      {notice && <p className="m-0 rounded-md border border-success/40 bg-secondary p-2.5 text-xs text-secondary-foreground" role="status">{notice}</p>}
      {failed && <p className="m-0 text-xs text-destructive" role="alert">{t('catLoadError')} <Button type="button" variant="link" onClick={() => void reload()}>{t('retry')}</Button></p>}
      {loading && !catalog.categories.length && !failed && <p className="m-0 text-sm text-subtle" role="status">{t('catLoading')}</p>}
      {!loading && !failed && (
        <Card className="overflow-x-auto rounded-[9px] border border-border bg-card">
          {catalog.categories.length === 0 ? <p className="px-[21px] py-8 text-center text-sm text-subtle">{t('catEmptyCategories')}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('catNameAr')}</TableHead>
                  <TableHead>{t('catNameEn')}</TableHead>
                  <TableHead>{t('catProducts')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  {canManage && <TableHead><span className="sr-only">{t('catActions')}</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.categories.map((category) => (
                  <TableRow key={category.id} className={category.is_active ? '' : 'opacity-70'}>
                    <TableCell><strong>{category.name_ar}</strong></TableCell>
                    <TableCell>{category.name || '—'}</TableCell>
                    <TableCell dir="ltr">{counts.get(category.id) ?? 0}</TableCell>
                    <TableCell><Badge variant={category.is_active ? 'success' : 'secondary'}>{category.is_active ? t('active') : t('inactive')}</Badge></TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ id: category.id, nameAr: category.name_ar, name: category.name, isActive: category.is_active })}><Pencil size={14} />{t('catEdit')}</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void toggle(category)}>{category.is_active ? t('catDeactivate') : t('catActivate')}</Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('catEditCategory') : t('catAddCategory')}</DialogTitle>
            <DialogDescription>{t('catCategoryHint')}</DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={save} className="grid gap-4 py-2">
              <Label className="grid gap-2 text-sm font-medium"><span>{t('catNameAr')}</span><Input autoFocus value={draft.nameAr} onChange={(event) => setDraft({ ...draft, nameAr: event.target.value })} maxLength={120} required dir="rtl" /></Label>
              <Label className="grid gap-2 text-sm font-medium"><span>{t('catNameEn')} <small className="text-muted-foreground">{t('catOptional')}</small></span><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={120} /></Label>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>{t('cancel')}</Button>
                <Button type="submit" variant="primary" disabled={busy}>{busy ? t('saving') : t('catSave')}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
