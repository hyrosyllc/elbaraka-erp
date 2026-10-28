'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

type Row = { supplierId: string; name: string; receivedMad: number; paidMad: number; outstandingMad: number; lastReceiptAt: string | null; lastPaymentAt: string | null };
type Payload = { suppliers: Row[]; totalOutstandingMad: number; canPay: boolean };

const METHODS = ['cash', 'bank_transfer', 'card', 'cheque', 'other'] as const;
const METHOD_KEYS = { cash: 'payCash', bank_transfer: 'payBankTransfer', card: 'payCard', cheque: 'payCheque', other: 'payOther' } as const;

export function SupplierPayablesPanel() {
  const { t, locale } = useLocale();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<Row | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/operations/payables', { cache: 'no-store' });
    const result = await response.json().catch(() => ({})) as Payload & { error?: string };
    if (!response.ok) { setError(result.error ?? t('payablesLoadFailed')); return; }
    setData(result);
    setError('');
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  function open(row: Row) {
    setTarget(row);
    setAmount(String(row.outstandingMad));
    setMethod('cash');
    setReference('');
    setFormError('');
  }

  async function pay() {
    if (!target) return;
    setBusy(true);
    const response = await fetch('/api/operations/payables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pay', supplierId: target.supplierId, amountMad: Math.round(Number(amount) * 100) / 100, method, reference, idempotencyKey: crypto.randomUUID() }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) { setFormError(result.error ?? t('mapActionFailed')); return; }
    setTarget(null);
    await load();
  }

  if (error) return <p className="text-xs text-destructive" role="alert">{error}</p>;
  if (!data) return null;
  const value = Number(amount);
  const valid = target !== null && value > 0 && value <= target.outstandingMad + 0.001;

  return (
    <Card className="grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-sm font-bold">{t('payablesTitle')}</h3>
        <span className="text-sm text-subtle">{t('payablesOutstanding')}: <strong className="text-foreground">{formatMad(data.totalOutstandingMad, locale)}</strong></span>
      </div>
      {data.suppliers.length === 0 ? <p className="m-0 text-xs text-subtle">{t('payablesEmpty')}</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>{t('supplier')}</TableHead><TableHead>{t('payablesReceived')}</TableHead><TableHead>{t('payablesPaid')}</TableHead><TableHead>{t('payablesOutstanding')}</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.suppliers.map((row) => (
              <TableRow key={row.supplierId}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="tabular-nums">{formatMad(row.receivedMad, locale)}</TableCell>
                <TableCell className="tabular-nums">{formatMad(row.paidMad, locale)}</TableCell>
                <TableCell className="tabular-nums font-semibold">{formatMad(row.outstandingMad, locale)}</TableCell>
                <TableCell>{data.canPay && row.outstandingMad > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => open(row)}>{t('payablesPay')}</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={target !== null} onOpenChange={(next) => { if (!next) setTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('payablesPay')} · {target?.name}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-3">
            <Label className="grid gap-1 text-caption text-subtle">{t('adjAmount')}<Input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Label>
            <Label className="grid gap-1 text-caption text-subtle">{t('payablesMethod')}
              <Select value={method} onValueChange={(next) => setMethod(next as (typeof METHODS)[number])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((entry) => <SelectItem key={entry} value={entry}>{t(METHOD_KEYS[entry])}</SelectItem>)}</SelectContent>
              </Select>
            </Label>
            <Label className="grid gap-1 text-caption text-subtle">{t('payablesReference')}<Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} /></Label>
            {formError && <p className="m-0 text-xs text-destructive" role="alert">{formError}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setTarget(null)}>{t('close')}</Button>
            <Button type="button" variant="primary" disabled={busy || !valid} onClick={() => void pay()}>{t('payablesPay')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
