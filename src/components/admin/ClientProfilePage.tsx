'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TranslationKey } from '@/lib/i18n';
import { formatMad, workspacePath } from '@/lib/workspace';
import { ClientOperations, type OpNote, type OpProduct } from './ClientOperations';
import { AdjustInvoiceDialog, ApplyCreditDialog, type MoneyInvoice, PayInvoiceDialog } from './InvoiceMoneyDialogs';
import { useLocale } from './LocaleContext';

type Adjustment = { id: string; kind: string; amountMad: number; description: string; createdAt: string };
type AccountInvoice = MoneyInvoice & {
  documentNumber: string;
  issuedAt: string;
  dueDate: string | null;
  adjustmentMad: number;
  status: 'paid' | 'partial' | 'unpaid';
  overdue: boolean;
  payments: { id: string; amountMad: number; method: string; paidAt: string; reference: string | null }[];
  adjustments: Adjustment[];
};
type Note = { id: string; invoiceId: string | null; kind: string; note: string; promisedDate: string | null; isResolved: boolean; createdAt: string; overdue: boolean };
type Account = {
  client: { id: string; code: string; name: string; nameAr: string; contactName: string; phone: string; address: string; city: string; isActive: boolean };
  summary: {
    invoicedMad: number; adjustmentMad: number; paidMad: number; outstandingMad: number; overdueMad: number; creditMad: number;
    returnedMad: number; orderCount: number; returnCount: number; toShipUnits: number;
  };
  invoices: AccountInvoice[];
  orders: { id: string; documentNumber: string; status: string; createdAt: string; remainingUnits: number }[];
  toShip: { orderId: string; orderNumber: string; sku: string; name: string; remaining: number; valueMad: number }[];
  notes: Note[];
  returns: { id: string; documentNumber: string; status: string; reason: string; createdAt: string }[];
  deliveries: (OpNote & { createdAt: string; deliveredAt: string | null })[];
  products: OpProduct[];
};

const NOTE_KINDS = [
  { value: 'promise_to_pay', key: 'noteKind_promise_to_pay' },
  { value: 'note', key: 'noteKind_note' },
  { value: 'call', key: 'noteKind_call' },
  { value: 'visit', key: 'noteKind_visit' },
] as const satisfies readonly { value: string; key: TranslationKey }[];
const NOTE_KIND_KEYS: Record<string, TranslationKey> = Object.fromEntries(NOTE_KINDS.map((kind) => [kind.value, kind.key]));
const ADJ_KEYS: Record<string, TranslationKey> = {
  return_credit: 'adjKind_return_credit', discount: 'adjKind_discount', correction: 'adjKind_correction', refund: 'adjKind_refund',
};
const STATUS_KEYS: Record<string, TranslationKey> = {
  paid: 'paid', partial: 'partiallyPaid', unpaid: 'unpaid',
  draft: 'ordSt_draft', confirmed: 'ordSt_confirmed', part_delivered: 'ordSt_part_delivered', delivered: 'ordSt_delivered', cancelled: 'ordSt_cancelled',
  ready: 'deliveryReady', dispatched: 'deliveryDispatched', failed: 'deliveryFailed',
  requested: 'requested', inspection: 'inspection', released: 'released', rejected: 'rejected',
};

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warning' | 'destructive' | 'success' }) {
  const color = tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-foreground';
  return (
    <Card className="grid gap-1 p-4">
      <span className="text-caption text-subtle">{label}</span>
      <strong className={`text-xl ${color}`}>{value}</strong>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="m-0 text-base font-bold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function ClientProfilePage({ clientId }: { clientId: string }) {
  const { t, locale } = useLocale();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [payTarget, setPayTarget] = useState<AccountInvoice | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AccountInvoice | null>(null);
  const [creditTarget, setCreditTarget] = useState<AccountInvoice | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteKind, setNoteKind] = useState('promise_to_pay');
  const [noteText, setNoteText] = useState('');
  const [noteDate, setNoteDate] = useState('');
  const [noteInvoice, setNoteInvoice] = useState('none');
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/operations/clients/${clientId}/account`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as Account & { error?: string };
      if (!response.ok) throw new Error(result.error ?? t('mapLoadError'));
      setAccount(result);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('mapLoadError'));
    } finally {
      setLoading(false);
    }
  }, [clientId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function postNote(body: Record<string, unknown>): Promise<string | null> {
    try {
      const response = await fetch(`/api/operations/clients/${clientId}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
      });
      if (response.ok) return null;
      const result = await response.json().catch(() => ({})) as { error?: string };
      return result.error ?? t('mapActionFailed');
    } catch {
      return t('mapActionFailed');
    }
  }

  async function saveNote() {
    setBusy(true);
    const failure = await postNote({
      action: 'note', kind: noteKind, note: noteText.trim(),
      invoiceId: noteInvoice === 'none' ? null : noteInvoice,
      promisedDate: noteKind === 'promise_to_pay' ? noteDate : null,
    });
    setBusy(false);
    if (failure) return setNoteError(failure);
    setNoteOpen(false);
    setMessage({ tone: 'ok', text: t('noteSaved') });
    void load();
  }

  async function resolve(noteId: string) {
    const failure = await postNote({ action: 'resolveNote', noteId });
    setMessage(failure ? { tone: 'error', text: failure } : { tone: 'ok', text: t('noteSaved') });
    if (!failure) void load();
  }

  function done(text: string) {
    setPayTarget(null);
    setAdjustTarget(null);
    setMessage({ tone: 'ok', text });
    void load();
  }

  if (loading) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingInvoices')}</p>;
  if (loadError || !account) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">{loadError || t('mapLoadError')} <Button type="button" variant="link" onClick={() => { setLoading(true); void load(); }}>{t('retry')}</Button></p>;
  }

  const { client, summary } = account;
  const openInvoices = account.invoices.filter((invoice) => invoice.balanceMad > 0);
  const openNotes = account.notes.filter((note) => !note.isResolved && note.kind === 'promise_to_pay');
  const invoiceNumber = (id: string | null) => account.invoices.find((invoice) => invoice.id === id)?.documentNumber;
  const date = (value: string) => new Date(value).toLocaleDateString(locale === 'ar' ? 'ar-MA' : 'en-GB', { timeZone: 'Africa/Casablanca' });
  const status = (key: string) => (STATUS_KEYS[key] ? t(STATUS_KEYS[key]) : key);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={workspacePath('clients')} className="inline-flex items-center gap-1 text-xs text-subtle no-underline hover:text-primary"><ArrowLeft size={14} aria-hidden="true" />{t('acctBack')}</Link>
        <Button type="button" variant="primary" size="sm" onClick={() => { setNoteKind('promise_to_pay'); setNoteText(''); setNoteDate(''); setNoteInvoice('none'); setNoteError(''); setNoteOpen(true); }}>{t('noteAdd')}</Button>
      </div>

      <Card className="grid gap-1 p-4 text-sm">
        <strong className="text-lg text-foreground">{locale === 'ar' && client.nameAr ? client.nameAr : client.name} <span className="font-normal text-subtle" dir="ltr">· {client.code}</span></strong>
        <span className="text-muted-foreground">{[client.contactName, client.phone, client.address, client.city].filter(Boolean).join(' · ') || '—'}</span>
        {!client.isActive && <Badge variant="secondary" className="w-fit">{t('inactive')}</Badge>}
      </Card>

      {message && <p className={`m-0 text-xs ${message.tone === 'ok' ? 'text-success' : 'text-destructive'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}

      <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
        <Stat label={t('acctInvoiced')} value={formatMad(summary.invoicedMad, locale)} />
        <Stat label={t('acctPaid')} value={formatMad(summary.paidMad, locale)} tone="success" />
        <Stat label={t('acctOutstanding')} value={formatMad(summary.outstandingMad, locale)} tone={summary.outstandingMad > 0 ? 'warning' : undefined} />
        <Stat label={t('acctOverdue')} value={formatMad(summary.overdueMad, locale)} tone={summary.overdueMad > 0 ? 'destructive' : undefined} />
        <Stat label={t('acctReturned')} value={formatMad(summary.returnedMad, locale)} />
        <Stat label={t('acctCredit')} value={formatMad(summary.creditMad, locale)} tone={summary.creditMad > 0 ? 'success' : undefined} />
        <Stat label={t('acctToShip')} value={summary.toShipUnits} tone={summary.toShipUnits > 0 ? 'warning' : undefined} />
        <Stat label={t('acctOrders')} value={summary.orderCount} />
      </div>

      <Section title={t('opTitle')}>
        <ClientOperations
          clientId={clientId}
          products={account.products}
          orders={account.orders}
          notes={account.deliveries}
          onChanged={(result) => { setMessage(result); void load(); }}
        />
      </Section>

      <Section title={t('acctInvoices')}>
        {account.invoices.length === 0 ? <p className="m-0 text-xs text-subtle">{t('noInvoices')}</p> : (
          <div className="w-full overflow-x-auto rounded-md border border-border">
            <Table className="w-full min-w-max text-start text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoiceNumber')}</TableHead>
                  <TableHead>{t('total')}</TableHead>
                  <TableHead>{t('adjAdjustments')}</TableHead>
                  <TableHead>{t('paid')}</TableHead>
                  <TableHead>{t('balanceDue')}</TableHead>
                  <TableHead>{t('dueDate')}</TableHead>
                  <TableHead>{t('invoiceStatus')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell><strong dir="ltr">{invoice.documentNumber}</strong><br /><span className="text-subtle">{date(invoice.issuedAt)}</span></TableCell>
                    <TableCell>{formatMad(invoice.totalMad, locale)}</TableCell>
                    <TableCell>
                      {invoice.adjustments.length === 0 ? '—' : invoice.adjustments.map((adjustment) => (
                        <div key={adjustment.id} title={adjustment.description}>{t(ADJ_KEYS[adjustment.kind] ?? 'adjAdjust')}: {formatMad(adjustment.amountMad, locale)}</div>
                      ))}
                    </TableCell>
                    <TableCell>{formatMad(invoice.paidMad, locale)}</TableCell>
                    <TableCell>{invoice.creditMad > 0 ? <span className="text-success">{t('acctCredit')} {formatMad(invoice.creditMad, locale)}</span> : formatMad(invoice.balanceMad, locale)}</TableCell>
                    <TableCell dir="ltr">{invoice.dueDate ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'paid' ? 'success' : invoice.status === 'partial' ? 'warning' : 'secondary'}>{status(invoice.status)}</Badge>
                      {invoice.overdue && <Badge variant="destructive" className="ms-1">{t('overdue')}</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {invoice.balanceMad > 0 && <Button type="button" variant="secondary" size="sm" onClick={() => setPayTarget(invoice)}>{t('recordPayment')}</Button>}
                        {invoice.balanceMad > 0 && account.invoices.some((other) => other.id !== invoice.id && other.creditMad > 0) && <Button type="button" variant="secondary" size="sm" onClick={() => setCreditTarget(invoice)}>{t('applyCredit')}</Button>}
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAdjustTarget(invoice)}>{t('adjAdjust')}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title={t('acctToShip')}>
        {account.toShip.length === 0 ? <p className="m-0 text-xs text-subtle">{t('acctNoToShip')}</p> : (
          <div className="w-full overflow-x-auto rounded-md border border-border">
            <Table className="w-full min-w-max text-start text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('orderNumber')}</TableHead>
                  <TableHead>{t('item')}</TableHead>
                  <TableHead>{t('quantity')}</TableHead>
                  <TableHead>{t('total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.toShip.map((line, index) => (
                  <TableRow key={`${line.orderId}-${line.sku}-${index}`}>
                    <TableCell><strong dir="ltr">{line.orderNumber}</strong></TableCell>
                    <TableCell>{line.name} <span className="text-subtle" dir="ltr">{line.sku}</span></TableCell>
                    <TableCell>{line.remaining}</TableCell>
                    <TableCell>{formatMad(line.valueMad, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title={t('acctNotes')}>
        {account.notes.length === 0 ? <p className="m-0 text-xs text-subtle">{t('acctNoNotes')}</p> : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {account.notes.map((note) => (
              <li key={note.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-xs">
                <span className="grid gap-1">
                  <span>
                    <Badge variant={note.kind === 'promise_to_pay' && !note.isResolved ? (note.overdue ? 'destructive' : 'warning') : 'secondary'}>{t(NOTE_KIND_KEYS[note.kind] ?? 'noteKind_note')}</Badge>
                    {note.promisedDate && <span className="ms-2" dir="ltr">{note.promisedDate}</span>}
                    {invoiceNumber(note.invoiceId) && <span className="ms-2 text-subtle" dir="ltr">{invoiceNumber(note.invoiceId)}</span>}
                  </span>
                  <span className="text-foreground">{note.note}</span>
                  <span className="text-subtle">{date(note.createdAt)}{note.isResolved ? ` · ${t('noteResolved')}` : ''}</span>
                </span>
                {note.kind === 'promise_to_pay' && !note.isResolved && <Button type="button" variant="secondary" size="sm" onClick={() => void resolve(note.id)}>{t('noteResolve')}</Button>}
              </li>
            ))}
          </ul>
        )}
        {openNotes.length > 0 && <p className="m-0 text-xs text-subtle">{openNotes.length} {t('notePromisesOpen')}</p>}
      </Section>

      <Section title={t('acctHistory')}>
        <div className="grid gap-3 min-[900px]:grid-cols-3">
          <Card className="grid gap-1 p-3 text-xs">
            <strong className="text-foreground">{t('acctOrders')}</strong>
            {account.orders.length === 0 ? '—' : account.orders.slice(0, 15).map((order) => (
              <span key={order.id} className="flex justify-between gap-2"><span dir="ltr">{order.documentNumber}</span><span className="text-subtle">{status(order.status)}{order.remainingUnits > 0 ? ` · ${order.remainingUnits}` : ''}</span></span>
            ))}
          </Card>
          <Card className="grid gap-1 p-3 text-xs">
            <strong className="text-foreground">{t('acctDeliveries')}</strong>
            {account.deliveries.length === 0 ? '—' : account.deliveries.slice(0, 15).map((note) => (
              <span key={note.id} className="flex justify-between gap-2"><span dir="ltr">{note.documentNumber}</span><span className="text-subtle">{status(note.status)} · {date(note.deliveredAt ?? note.createdAt)}</span></span>
            ))}
          </Card>
          <Card className="grid gap-1 p-3 text-xs">
            <strong className="text-foreground">{t('acctReturns')}</strong>
            {account.returns.length === 0 ? '—' : account.returns.slice(0, 15).map((entry) => (
              <span key={entry.id} className="flex justify-between gap-2" title={entry.reason}><span dir="ltr">{entry.documentNumber}</span><span className="text-subtle">{status(entry.status)} · {date(entry.createdAt)}</span></span>
            ))}
          </Card>
        </div>
      </Section>

      <PayInvoiceDialog invoice={payTarget} onClose={() => setPayTarget(null)} onDone={done} />
      <ApplyCreditDialog target={creditTarget} sources={account.invoices} onClose={() => setCreditTarget(null)} onDone={done} />
      <AdjustInvoiceDialog invoice={adjustTarget} onClose={() => setAdjustTarget(null)} onDone={done} />

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('noteAdd')}</DialogTitle><DialogDescription>{client.name}</DialogDescription></DialogHeader>
          <DialogBody className="grid gap-3">
            <Label className="grid gap-1 text-caption text-subtle">{t('noteType')}
              <Select value={noteKind} onValueChange={setNoteKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NOTE_KINDS.map((kind) => <SelectItem key={kind.value} value={kind.value}>{t(kind.key)}</SelectItem>)}</SelectContent>
              </Select>
            </Label>
            {noteKind === 'promise_to_pay' && <Label className="grid gap-1 text-caption text-subtle">{t('notePromisedDate')}<Input type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} /></Label>}
            <Label className="grid gap-1 text-caption text-subtle">{t('noteForInvoice')}
              <Select value={noteInvoice} onValueChange={setNoteInvoice}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('noteGeneral')}</SelectItem>
                  {openInvoices.map((invoice) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.documentNumber} · {formatMad(invoice.balanceMad, locale)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
            <Label className="grid gap-1 text-caption text-subtle">{t('noteText')}<Input maxLength={500} value={noteText} onChange={(event) => setNoteText(event.target.value)} /></Label>
            {noteError && <p className="m-0 text-xs text-destructive" role="alert">{noteError}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setNoteOpen(false)}>{t('close')}</Button>
            <Button type="button" variant="primary" disabled={busy || noteText.trim().length === 0 || (noteKind === 'promise_to_pay' && !noteDate)} onClick={() => void saveNote()}>{t('noteAdd')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
