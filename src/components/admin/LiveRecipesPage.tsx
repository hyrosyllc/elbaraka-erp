'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocale } from './LocaleContext';

type Item = { id: string; sku: string; name: string; type: string; unit: string };
type Recipe = {
  id: string;
  outputItemId: string;
  version: number;
  outputQuantity: number;
  status: 'draft' | 'approved';
  components: { itemId: string; quantity: number }[];
};
type EditLine = { key: string; itemId: string; quantity: string };

const COMPONENT_TYPES = ['raw_material', 'packaging', 'blend'];
const OUTPUT_TYPES = ['blend', 'finished_good'];
let lineCounter = 0;
const newLine = (itemId = '', quantity = ''): EditLine => ({ key: `line-${++lineCounter}`, itemId, quantity });

export function LiveRecipesPage() {
  const { t } = useLocale();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ recipeId: string | null; outputItemId: string; outputQuantity: string; lines: EditLine[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/recipes', { cache: 'no-store' });
      if (!response.ok) throw new Error('load');
      const result = await response.json() as { recipes: Recipe[]; items: Item[]; canApprove: boolean };
      setRecipes(result.recipes);
      setItems(result.items);
      setCanApprove(result.canApprove);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const outputs = useMemo(() => items.filter((item) => OUTPUT_TYPES.includes(item.type)), [items]);
  const inputs = useMemo(() => items.filter((item) => COMPONENT_TYPES.includes(item.type)), [items]);
  const draftOutputIds = useMemo(() => new Set(recipes.filter((recipe) => recipe.status === 'draft').map((recipe) => recipe.outputItemId)), [recipes]);

  const grouped = useMemo(() => {
    const byOutput = new Map<string, Recipe[]>();
    for (const recipe of recipes) byOutput.set(recipe.outputItemId, [...(byOutput.get(recipe.outputItemId) ?? []), recipe]);
    return [...byOutput.entries()].map(([outputId, list]) => ({ output: itemById.get(outputId), recipes: [...list].sort((a, b) => b.version - a.version) })).filter((entry) => entry.output);
  }, [recipes, itemById]);

  async function post(body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/operations/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage({ tone: 'error', text: result.error ?? t('mapActionFailed') });
        return false;
      }
      setMessage({ tone: 'ok', text: okText });
      await load();
      return true;
    } catch {
      setMessage({ tone: 'error', text: t('mapActionFailed') });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const outputQuantityValue = Number(editor?.outputQuantity ?? '');
  const filledLines = editor?.lines.filter((line) => line.itemId !== '' || line.quantity !== '') ?? [];
  const editorValid = editor !== null && editor.outputItemId !== '' && outputQuantityValue > 0
    && filledLines.length > 0
    && filledLines.every((line) => line.itemId !== '' && Number(line.quantity) > 0)
    && new Set(filledLines.map((line) => line.itemId)).size === filledLines.length;

  function describe(recipe: Recipe) {
    return recipe.components.map((component) => {
      const item = itemById.get(component.itemId);
      return `${component.quantity} ${item?.unit ?? ''} ${item?.name ?? ''}`.trim();
    });
  }

  if (loading) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingRecipes')}</p>;
  if (loadError) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">{t('mapLoadError')} <Button type="button" variant="link" onClick={() => { setLoading(true); void load(); }}>{t('retry')}</Button></p>;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 max-w-xl text-xs text-subtle">{t('recipeVersionHint')}</p>
        <Button type="button" variant="primary" size="sm" onClick={() => setEditor({ recipeId: null, outputItemId: '', outputQuantity: '', lines: [newLine()] })}>{t('newRecipe')}</Button>
      </div>
      <p className="m-0 max-w-4xl border-s-2 border-primary ps-3 text-xs leading-relaxed text-muted-foreground" role="note">{t('recipePurposeHint')}</p>
      {message && <p className={`m-0 rounded-md border p-3 text-xs ${message.tone === 'ok' ? 'border-success bg-secondary text-success' : 'border-destructive bg-destructive-soft text-destructive'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}

      {grouped.length === 0 ? <p className="m-0 text-xs text-subtle">{t('noRecipes')}</p> : grouped.map(({ output, recipes: list }) => output && (
        <article key={output.id} className="grid gap-2 rounded-md border border-border p-3">
          <h3 className="m-0 text-sm font-semibold">{output.name} <span className="font-mono text-caption font-normal text-subtle" dir="ltr">{output.sku}</span></h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {list.map((recipe) => (
              <li key={recipe.id} className="grid gap-1.5 rounded-md bg-surface p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>v{recipe.version}</strong>
                  <Badge variant={recipe.status === 'approved' ? 'success' : 'secondary'}>{recipe.status === 'approved' ? t('approved') : t('draft')}</Badge>
                  <span className="text-subtle" dir="ltr">{t('batchOutput')}: {recipe.outputQuantity} {output.unit}</span>
                  {recipe.status === 'draft' && (
                    <span className="ms-auto flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setEditor({ recipeId: recipe.id, outputItemId: recipe.outputItemId, outputQuantity: String(recipe.outputQuantity), lines: recipe.components.map((component) => newLine(component.itemId, String(component.quantity))) })}>{t('editRecipe')}</Button>
                      {canApprove && <Button type="button" size="sm" variant="primary" disabled={busy} onClick={() => void post({ action: 'approve', recipeId: recipe.id }, t('recipeApprovedOk'))}>{t('approve')}</Button>}
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: 'delete', recipeId: recipe.id }, t('recipeDeletedOk'))}>{t('deleteDraft')}</Button>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {describe(recipe).map((text, index) => <span key={`${recipe.id}-${index}`} className="rounded-full border border-border bg-card px-2 py-0.5 text-micro text-muted-foreground" dir="ltr">{text}</span>)}
                </div>
              </li>
            ))}
          </ul>
          {!draftOutputIds.has(output.id) && (
            <div>
              <Button type="button" size="sm" variant="secondary" onClick={() => {
                const latest = list[0];
                setEditor({ recipeId: null, outputItemId: output.id, outputQuantity: String(latest.outputQuantity), lines: latest.components.map((component) => newLine(component.itemId, String(component.quantity))) });
              }}>{t('newRecipeVersion')}</Button>
            </div>
          )}
        </article>
      ))}

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{editor?.recipeId ? t('editRecipe') : t('newRecipe')}</DialogTitle><DialogDescription>{t('recipeDraftHint')}</DialogDescription></DialogHeader>
          <DialogBody className="grid gap-3">
            <Label className="grid gap-1 text-caption text-subtle"><span>{t('recipeOutputLabel')}</span>
              <Select value={editor?.outputItemId ?? ''} disabled={editor?.recipeId !== null || (editor?.lines.some((line) => line.itemId !== '') && editor?.outputItemId !== '')} onValueChange={(value) => setEditor((current) => (current ? { ...current, outputItemId: value } : current))}>
                <SelectTrigger aria-label={t('recipeOutputLabel')}><SelectValue placeholder={t('recipeOutputSelect')} /></SelectTrigger>
                <SelectContent>{outputs.filter((item) => !draftOutputIds.has(item.id) || item.id === editor?.outputItemId).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.sku} · {t(item.type === 'blend' ? 'blend' : 'finishedGood')}</SelectItem>)}</SelectContent>
              </Select>
            </Label>
            <Label className="grid gap-1 text-caption text-subtle">{t('batchOutput')}{editor && itemById.get(editor.outputItemId) ? ` (${itemById.get(editor.outputItemId)?.unit})` : ''}
              <Input type="number" min={0} step="0.001" value={editor?.outputQuantity ?? ''} onChange={(event) => setEditor((current) => (current ? { ...current, outputQuantity: event.target.value } : current))} />
            </Label>
            <div className="grid gap-2">
              <p className="m-0 text-caption font-semibold text-subtle">{t('recipeComponentsLabel')}</p>
              {editor?.lines.map((line) => (
                <div key={line.key} className="grid grid-cols-[1fr_100px_auto] items-center gap-2">
                  <Select value={line.itemId} onValueChange={(value) => setEditor((current) => (current ? { ...current, lines: current.lines.map((candidate) => (candidate.key === line.key ? { ...candidate, itemId: value } : candidate)) } : current))}>
                    <SelectTrigger aria-label={t('recipeComponentSelect')}><SelectValue placeholder={t('recipeComponentSelect')} /></SelectTrigger>
                    <SelectContent>{inputs.filter((item) => item.id !== editor.outputItemId).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {t(item.type === 'raw_material' ? 'rawMaterial' : item.type === 'blend' ? 'blend' : 'packaging')} ({item.unit})</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" min={0} step="0.001" aria-label={t('quantity')} value={line.quantity} onChange={(event) => setEditor((current) => (current ? { ...current, lines: current.lines.map((candidate) => (candidate.key === line.key ? { ...candidate, quantity: event.target.value } : candidate)) } : current))} />
                  <Button type="button" size="sm" variant="ghost" disabled={editor.lines.length === 1} onClick={() => setEditor((current) => (current ? { ...current, lines: current.lines.filter((candidate) => candidate.key !== line.key) } : current))}>{t('removeLine')}</Button>
                </div>
              ))}
              <div><Button type="button" size="sm" variant="secondary" onClick={() => setEditor((current) => (current ? { ...current, lines: [...current.lines, newLine()] } : current))}>{t('addComponent')}</Button></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEditor(null)}>{t('close')}</Button>
            <Button type="button" variant="primary" disabled={busy || !editorValid} onClick={() => {
              if (!editor) return;
              void post({
                action: 'save',
                recipeId: editor.recipeId,
                outputItemId: editor.outputItemId,
                outputQuantity: outputQuantityValue,
                components: filledLines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) })),
              }, t('recipeSavedOk')).then((ok) => { if (ok) setEditor(null); });
            }}>{t('saveDraft')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
