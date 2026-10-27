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
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

type PaymentStatus = 'paid' | 'partial' | 'unpaid';
type Invoice = {
  id: string;
  documentNumber: string;
  clientName: string;
  subtotalMad: number;
  taxMad: number;
  totalMad: number;
  paidMad: number;
  balanceMad: number;
  status: PaymentStatus;
  overdue: boolean;
  issuedAt: string;
  dueDate: string | null;
};
type Unbilled = { id: string; documentNumber: string; clientName: string; subtotalMad: number };

const STATUS_KEYS: Record<PaymentStatus, TranslationKey> = { paid: 'paid', partial: 'partiallyPaid', unpaid: 'unpaid' };
const STATUS_BADGE: Record<PaymentStatus, 'success' | 'warning' | 'secondary'> = { paid: 'success', partial: 'warning', unpaid: 'secondary' };
const METHODS: { value: string; key: TranslationKey }[] = [
  { value: 'cash', key: 'payCash' },
  { value: 'bank_transfer', key: 'payBankTransfer' },
  { value: 'card', key: 'payCard' },
  { value: 'cheque', key: 'payCheque' },
  { value: 'other', key: 'payOther' },
];

export function LiveInvoicesPage() {
  const { t, locale } = useLocale();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [unbilled, setUnbilled] = useState<Unbilled[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [issueTarget, setIssueTarget] = useState<Unbilled | null>(null);
  const [taxRate, setTaxRate] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/invoices', { cache: 'no-store' });
      if (!response.ok) throw new Error('load');
      const result = await response.json() as { invoices: Invoice[]; unbilled: Unbilled[] };
      setInvoices(result.invoices);
      setUnbilled(result.unbilled);
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
      const response = await fetch('/api/operations/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
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

  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.balanceMad, 0);
  const overdueTotal = invoices.filter((invoice) => invoice.overdue).reduce((sum, invoice) => sum + invoice.balanceMad, 0);
  const taxValue = Number(taxRate);
  const amountValue = Number(amount);

  if (loading) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingInvoices')}</p>;
  if (loadError) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">{t('mapLoadError')} <Button type="button" variant="link" onClick={() => { setLoading(true); void load(); }}>{t('retry')}</Button></p>;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-subtle">
        <span>{t('outstandingInvoices')}: <strong className="text-foreground">{formatMad(outstanding, locale)}</strong></span>
        <span>{t('overdueBalance')}: <strong className="text-destructive">{formatMad(overdueTotal, locale)}</strong></span>
      </div>
      <p className="m-0 text-xs text-subtle">{t('notLegalInvoice')}</p>
      {message && <p className={`m-0 rounded-md border p-3 text-xs ${message.tone === 'ok' ? 'border-success bg-secondary text-success' : 'border-destructive bg-destructive-soft text-destructive'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}

      <div className="grid gap-2">
        <h3 className="m-0 text-sm font-semibold">{t('awaitingInvoice')}</h3>
        {unbilled.length === 0 ? <p className="m-0 text-xs text-subtle">{t('noUnbilledDeliveries')}</p> : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {unbilled.map((note) => (
              <li key={note.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-xs">
                <span><strong dir="ltr">{note.documentNumber}</strong> · {note.clientName} · {formatMad(note.subtotalMad, locale)}</span>
                <Button type="button" variant="primary" size="sm" onClick={() => { setTaxRate('0'); setDueDate(''); setIssueTarget(note); }}>{t('createInvoice')}</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {invoices.length === 0 ? <p className="m-0 text-xs text-subtle">{t('noInvoices')}</p> : (
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <Table className="w-full min-w-max text-start text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>{t('invoiceNumber')}</TableHead>
                <TableHead>{t('customerOrStore')}</TableHead>
                <TableHead>{t('total')}</TableHead>
                <TableHead>{t('paid')}</TableHead>
                <TableHead>{t('balanceDue')}</TableHead>
                <TableHead>{t('dueDate')}</TableHead>
                <TableHead>{t('invoiceStatus')}</TableHead>
                <TableHead>{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell><strong dir="ltr">{invoice.documentNumber}</strong></TableCell>
                  <TableCell>{invoice.clientName}</TableCell>
                  <TableCell>{formatMad(invoice.totalMad, locale)}</TableCell>
                  <TableCell>{formatMad(invoice.paidMad, locale)}</TableCell>
                  <TableCell>{formatMad(invoice.balanceMad, locale)}</TableCell>
                  <TableCell dir="ltr">{invoice.dueDate ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[invoice.status]}>{t(STATUS_KEYS[invoice.status])}</Badge>
                    {invoice.overdue && <Badge variant="destructive" className="ms-1">{t('overdue')}</Badge>}
                  </TableCell>
                  <TableCell>
                    {invoice.balanceMad > 0 && <Button type="button" variant="secondary" size="sm" onClick={() => { setAmount(String(invoice.balanceMad)); setMethod('cash'); setReference(''); setPayTarget(invoice); }}>{t('recordPayment')}</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={issueTarget !== null} onOpenChange={(open) => { if (!open) setIssueTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('createInvoice')} · {issueTarget?.documentNumber}</DialogTitle><DialogDescription>{issueTarget?.clientName}</DialogDescription></DialogHeader>
          <DialogBody className="grid gap-3">
            <Label className="grid gap-1 text-caption text-subtle">{t('taxRatePercent')}<Input type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Label>
            <Label className="grid gap-1 text-caption text-subtle">{t('dueDate')}<Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Label>
            {issueTarget && Number.isFinite(taxValue) && <p className="m-0 text-xs text-subtle">{t('total')}: <strong className="text-foreground">{formatMad(Math.round(issueTarget.subtotalMad * (1 + taxValue / 100) * 100) / 100, locale)}</strong></p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIssueTarget(null)}>{t('close')}</Button>
            <Button type="button" variant="primary" disabled={busy || !Number.isFinite(taxValue) || taxValue < 0 || taxValue > 100} onClick={() => {
              if (!issueTarget) return;
              void post({ action: 'issue', noteId: issueTarget.id, taxRatePercent: taxValue, dueDate: dueDate || null }, t('invoiceCreated')).then((ok) => { if (ok) setIssueTarget(null); });
            }}>{t('createInvoice')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payTarget !== null} onOpenChange={(open) => { if (!open) setPayTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('recordPayment')} · {payTarget?.documentNumber}</DialogTitle><DialogDescription>{t('balanceDue')}: {payTarget ? formatMad(payTarget.balanceMad, locale) : ''}</DialogDescription></DialogHeader>
          <DialogBody className="grid gap-3">
            <Label className="grid gap-1 text-caption text-subtle">{t('amount')}<Input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Label>
            <Label className="grid gap-1 text-caption text-subtle">{t('paymentMethod')}
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.key)}</SelectItem>)}</SelectContent>
              </Select>
            </Label>
            <Label className="grid gap-1 text-caption text-subtle">{t('paymentReference')}<Input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} /></Label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPayTarget(null)}>{t('close')}</Button>
            <Button type="button" variant="primary" disabled={busy || !(amountValue > 0) || (payTarget !== null && amountValue > payTarget.balanceMad)} onClick={() => {
              if (!payTarget) return;
              void post({ action: 'pay', invoiceId: payTarget.id, amountMad: amountValue, method, reference }, t('paymentRecordedLive')).then((ok) => { if (ok) setPayTarget(null); });
            }}>{t('recordPayment')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
