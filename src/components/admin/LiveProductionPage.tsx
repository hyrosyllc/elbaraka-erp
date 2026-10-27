'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TranslationKey } from '@/lib/i18n';
import { useLocale } from './LocaleContext';

type ProductionStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
type Order = {
  id: string;
  documentNumber: string;
  itemName: string;
  unit: string;
  recipeVersion: number | null;
  targetQuantity: number;
  actualQuantity: number | null;
  status: ProductionStatus;
};
type Producible = { itemId: string; sku: string; name: string; unit: string };

const STATUS_KEYS: Record<ProductionStatus, TranslationKey> = { planned: 'planned', in_progress: 'inProgress', completed: 'completed', cancelled: 'statusCancelled' };
const STATUS_BADGE: Record<ProductionStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = { planned: 'secondary', in_progress: 'warning', completed: 'success', cancelled: 'destructive' };

export function LiveProductionPage() {
  const { t } = useLocale();
  const [orders, setOrders] = useState<Order[]>([]);
  const [producible, setProducible] = useState<Producible[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [itemId, setItemId] = useState('');
  const [target, setTarget] = useState('');
  const [completeTarget, setCompleteTarget] = useState<Order | null>(null);
  const [actual, setActual] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/production', { cache: 'no-store' });
      if (!response.ok) throw new Error('load');
      const result = await response.json() as { orders: Order[]; producible: Producible[] };
      setOrders(result.orders);
      setProducible(result.producible);
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

  async function post(body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/operations/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; details?: { sku: string; short: number }[] };
      if (!response.ok) {
        const shortage = Array.isArray(result.details) ? ` ${result.details.map((entry) => `${entry.sku}: −${entry.short}`).join(', ')}` : '';
        setMessage({ tone: 'error', text: `${result.error ?? t('mapActionFailed')}${shortage}` });
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

  const targetValue = Number(target);
  const actualValue = Number(actual);
  const chosen = producible.find((item) => item.itemId === itemId);

  if (loading) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingProduction')}</p>;
  if (loadError) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">{t('mapLoadError')} <Button type="button" variant="link" onClick={() => { setLoading(true); void load(); }}>{t('retry')}</Button></p>;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-subtle">{t('productionConsumeHint')}</p>
        <Button type="button" variant="primary" size="sm" disabled={producible.length === 0} onClick={() => { setItemId(''); setTarget(''); setCreating(true); }}>{t('newProduction')}</Button>
      </div>
      {producible.length === 0 && <p className="m-0 text-xs text-subtle">{t('noApprovedRecipes')}</p>}
      {message && <p className={`m-0 rounded-md border p-3 text-xs ${message.tone === 'ok' ? 'border-success bg-secondary text-success' : 'border-destructive bg-destructive-soft text-destructive'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}

      {orders.length === 0 ? <p className="m-0 text-xs text-subtle">{t('noProduction')}</p> : (
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <Table className="w-full min-w-max text-start text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>{t('productionNumber')}</TableHead>
                <TableHead>{t('product')}</TableHead>
                <TableHead>{t('targetQuantity')}</TableHead>
                <TableHead>{t('actualQuantity')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell><strong dir="ltr">{order.documentNumber}</strong>{order.recipeVersion !== null && <small className="block text-caption text-subtle">v{order.recipeVersion}</small>}</TableCell>
                  <TableCell>{order.itemName}</TableCell>
                  <TableCell dir="ltr">{order.targetQuantity} {order.unit}</TableCell>
                  <TableCell dir="ltr">{order.actualQuantity === null ? '—' : `${order.actualQuantity} ${order.unit}`}</TableCell>
                  <TableCell><Badge variant={STATUS_BADGE[order.status]}>{t(STATUS_KEYS[order.status])}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {order.status === 'planned' && <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => void post({ action: 'start', orderId: order.id }, t('productionStartedOk'))}>{t('startProduction')}</Button>}
                      {order.status === 'planned' && <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void post({ action: 'cancel', orderId: order.id }, t('productionCancelledOk'))}>{t('cancelOrder')}</Button>}
                      {order.status === 'in_progress' && <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => { setActual(String(order.targetQuantity)); setCompleteTarget(order); }}>{t('completeProduction')}</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('newProduction')}</DialogTitle><DialogDescription>{t('productionRecipeHint')}</DialogDescription></DialogHeader>
          <DialogBody className="grid gap-3">
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder={t('selectProduct')} /></SelectTrigger>
              <SelectContent>{producible.map((item) => <SelectItem key={item.itemId} value={item.itemId}>{item.name} · {item.sku}</SelectItem>)}</SelectContent>
            </Select>
            <Label className="grid gap-1 text-caption text-subtle">{t('targetQuantity')}{chosen ? ` (${chosen.unit})` : ''}<Input type="number" min={0} step="0.001" value={target} onChange={(event) => setTarget(event.target.value)} /></Label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>{t('close')}</Button>
            <Button type="button" variant="primary" disabled={busy || !chosen || !(targetValue > 0)} onClick={() => {
              void post({ action: 'create', itemId, targetQuantity: targetValue, idempotencyKey: crypto.randomUUID() }, t('productionPlannedOk')).then((ok) => { if (ok) setCreating(false); });
            }}>{t('newProduction')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeTarget !== null} onOpenChange={(open) => { if (!open) setCompleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('completeProduction')} · {completeTarget?.documentNumber}</DialogTitle><DialogDescription>{t('productionCompleteHint')}</DialogDescription></DialogHeader>
          <DialogBody>
            <Label className="grid gap-1 text-caption text-subtle">{t('actualQuantity')}{completeTarget ? ` (${completeTarget.unit})` : ''}<Input type="number" min={0} step="0.001" value={actual} onChange={(event) => setActual(event.target.value)} /></Label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCompleteTarget(null)}>{t('close')}</Button>
            <Button type="button" variant="primary" disabled={busy || !(actualValue > 0)} onClick={() => {
              if (!completeTarget) return;
              void post({ action: 'complete', orderId: completeTarget.id, actualQuantity: actualValue }, t('productionCompletedOk')).then((ok) => { if (ok) setCompleteTarget(null); });
            }}>{t('completeProduction')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
