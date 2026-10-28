'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TranslationKey } from '@/lib/i18n';
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

export type MoneyInvoice = {
  id: string;
  documentNumber: string;
  totalMad: number;
  netMad: number;
  paidMad: number;
  balanceMad: number;
  creditMad: number;
};

const METHODS: { value: string; key: TranslationKey }[] = [
  { value: 'cash', key: 'payCash' },
  { value: 'bank_transfer', key: 'payBankTransfer' },
  { value: 'card', key: 'payCard' },
  { value: 'cheque', key: 'payCheque' },
  { value: 'other', key: 'payOther' },
];

const ADJUSTMENT_KINDS = [
  { value: 'return_credit', key: 'adjKind_return_credit' },
  { value: 'discount', key: 'adjKind_discount' },
  { value: 'correction', key: 'adjKind_correction' },
  { value: 'refund', key: 'adjKind_refund' },
] as const satisfies readonly { value: string; key: TranslationKey }[];

const round = (value: number) => Math.round(value * 100) / 100;

async function postInvoice(body: Record<string, unknown>, fallback: string): Promise<string | null> {
  try {
    const response = await fetch('/api/operations/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
    });
    if (response.ok) return null;
    const result = await response.json().catch(() => ({})) as { error?: string };
    return result.error ?? fallback;
  } catch {
    return fallback;
  }
}

type DialogProps = {
  invoice: MoneyInvoice | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function PayInvoiceDialog({ invoice, onClose, onDone }: DialogProps) {
  const { t, locale } = useLocale();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!invoice) return;
    setAmount(String(invoice.balanceMad));
    setMethod('cash');
    setReference('');
    setError('');
  }, [invoice]);

  const value = Number(amount);
  const valid = invoice !== null && value > 0 && value <= invoice.balanceMad;

  async function submit() {
    if (!invoice || !valid) return;
    setBusy(true);
    const failure = await postInvoice({ action: 'pay', invoiceId: invoice.id, amountMad: round(value), method, reference }, t('mapActionFailed'));
    setBusy(false);
    if (failure) return setError(failure);
    onDone(t('paymentRecordedLive'));
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('recordPayment')} · {invoice?.documentNumber}</DialogTitle>
          <DialogDescription>{t('balanceDue')}: {invoice ? formatMad(invoice.balanceMad, locale) : ''}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <Label className="grid gap-1 text-caption text-subtle">{t('amount')}<Input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Label>
          <Label className="grid gap-1 text-caption text-subtle">{t('paymentMethod')}
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.key)}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-caption text-subtle">{t('paymentReference')}<Input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} /></Label>
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('close')}</Button>
          <Button type="button" variant="primary" disabled={busy || !valid} onClick={() => void submit()}>{t('recordPayment')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustInvoiceDialog({ invoice, onClose, onDone }: DialogProps) {
  const { t, locale } = useLocale();
  const [kind, setKind] = useState<string>('return_credit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!invoice) return;
    setKind('return_credit');
    setAmount('');
    setDescription('');
    setError('');
  }, [invoice]);

  const isRefund = kind === 'refund';
  const value = Number(amount);
  const max = invoice ? (isRefund ? invoice.creditMad : invoice.netMad) : 0;
  const valid = invoice !== null && value > 0 && round(value) <= max && description.trim().length > 0;
  const kinds = ADJUSTMENT_KINDS.filter((option) => option.value !== 'refund' || (invoice?.creditMad ?? 0) > 0);

  async function submit() {
    if (!invoice || !valid) return;
    setBusy(true);
    const failure = await postInvoice({ action: 'adjust', invoiceId: invoice.id, kind, amountMad: round(value), description: description.trim() }, t('mapActionFailed'));
    setBusy(false);
    if (failure) return setError(failure);
    onDone(t('adjSaved'));
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('adjAdjust')} · {invoice?.documentNumber}</DialogTitle>
          <DialogDescription>{t('adjHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <Label className="grid gap-1 text-caption text-subtle">{t('adjType')}
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{kinds.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.key)}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-caption text-subtle">{t('adjAmount')}<Input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Label>
          <Label className="grid gap-1 text-caption text-subtle">{t('adjDescription')}<Input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} /></Label>
          {invoice && (
            <p className="m-0 text-xs text-subtle">
              {t('total')}: <strong className="text-foreground">{formatMad(invoice.netMad, locale)}</strong>
              {!isRefund && value > 0 && <> → <strong className="text-foreground">{formatMad(round(invoice.netMad - value), locale)}</strong></>}
              {' · '}{t('paid')}: <strong className="text-foreground">{formatMad(invoice.paidMad, locale)}</strong>
              {isRefund && ` · ${t('acctCredit')}: ${formatMad(invoice.creditMad, locale)}`}
            </p>
          )}
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('close')}</Button>
          <Button type="button" variant="primary" disabled={busy || !valid} onClick={() => void submit()}>{t('adjAdjust')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ApplyCreditProps = {
  target: MoneyInvoice | null;
  sources: MoneyInvoice[];
  onClose: () => void;
  onDone: (message: string) => void;
};

export function ApplyCreditDialog({ target, sources, onClose, onDone }: ApplyCreditProps) {
  const { t, locale } = useLocale();
  const [sourceId, setSourceId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = sources.filter((source) => source.id !== target?.id && source.creditMad > 0);
  const source = options.find((option) => option.id === sourceId);
  const max = source && target ? Math.min(source.creditMad, target.balanceMad) : 0;

  useEffect(() => {
    if (!target) return;
    const first = options[0];
    setSourceId(first?.id ?? '');
    setAmount(first ? String(round(Math.min(first.creditMad, target.balanceMad))) : '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const value = Number(amount);
  const valid = target !== null && source !== undefined && value > 0 && round(value) <= max;

  async function submit() {
    if (!target || !source || !valid) return;
    setBusy(true);
    const failure = await postInvoice({ action: 'applyCredit', fromInvoiceId: source.id, toInvoiceId: target.id, amountMad: round(value) }, t('mapActionFailed'));
    setBusy(false);
    if (failure) return setError(failure);
    onDone(t('creditApplied'));
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('applyCredit')} · {target?.documentNumber}</DialogTitle>
          <DialogDescription>{t('applyCreditHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <Label className="grid gap-1 text-caption text-subtle">{t('creditFrom')}
            <Select value={sourceId} onValueChange={(next) => { setSourceId(next); const picked = options.find((option) => option.id === next); if (picked && target) setAmount(String(round(Math.min(picked.creditMad, target.balanceMad)))); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.documentNumber} · {formatMad(option.creditMad, locale)}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-caption text-subtle">{t('adjAmount')}<Input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Label>
          {target && <p className="m-0 text-xs text-subtle">{t('balanceDue')}: <strong className="text-foreground">{formatMad(target.balanceMad, locale)}</strong></p>}
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('close')}</Button>
          <Button type="button" variant="primary" disabled={busy || !valid} onClick={() => void submit()}>{t('applyCredit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ExternalReturnProps = {
  invoice: MoneyInvoice | null;
  products: { itemId: string | null; name: string; sku: string }[];
  onClose: () => void;
  onDone: (message: string) => void;
};

export function ExternalReturnDialog({ invoice, products, onClose, onDone }: ExternalReturnProps) {
  const { t } = useLocale();
  const [itemId, setItemId] = useState('none');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitValue, setUnitValue] = useState('');
  const [restock, setRestock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!invoice) return;
    setItemId('none'); setDescription(''); setQuantity('1'); setUnitValue(''); setRestock(false); setError('');
  }, [invoice]);

  const qty = Number(quantity);
  const value = Number(unitValue);
  const valid = invoice !== null && description.trim() !== '' && Number.isInteger(qty) && qty > 0 && value > 0 && (!restock || itemId !== 'none');

  async function submit() {
    if (!invoice || !valid) return;
    setBusy(true);
    const failure = await postInvoice({ action: 'externalReturn', invoiceId: invoice.id, itemId: itemId === 'none' ? null : itemId, description: description.trim(), quantity: qty, unitValueMad: round(value), restock }, t('mapActionFailed'));
    setBusy(false);
    if (failure) return setError(failure);
    onDone(t('externalReturnDone'));
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('externalReturn')} · {invoice?.documentNumber}</DialogTitle>
          <DialogDescription>{t('externalReturnHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <Label className="grid gap-1 text-caption text-subtle">{t('externalReturnProduct')}
            <Select value={itemId} onValueChange={(next) => { setItemId(next); const picked = products.find((product) => product.itemId === next); if (picked && !description) setDescription(picked.name); if (next === 'none') setRestock(false); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('externalReturnOther')}</SelectItem>
                {products.filter((product) => product.itemId).map((product) => <SelectItem key={product.itemId} value={product.itemId as string}>{product.name} · {product.sku}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-caption text-subtle">{t('adjDescription')}<Input value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} /></Label>
          <div className="grid grid-cols-2 gap-3">
            <Label className="grid gap-1 text-caption text-subtle">{t('quantity')}<Input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Label>
            <Label className="grid gap-1 text-caption text-subtle">{t('externalReturnUnitValue')}<Input type="number" min={0} step="0.01" value={unitValue} onChange={(event) => setUnitValue(event.target.value)} /></Label>
          </div>
          <Label className="flex items-center gap-2 text-sm"><Checkbox checked={restock} disabled={itemId === 'none'} onCheckedChange={(checked) => setRestock(checked === true)} />{t('externalReturnRestock')}</Label>
          {valid && <p className="m-0 text-xs text-subtle">{t('externalReturnCredit')}: <strong className="text-foreground">{formatMad(round(qty * value))}</strong></p>}
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('close')}</Button>
          <Button type="button" variant="primary" disabled={busy || !valid} onClick={() => void submit()}>{t('externalReturn')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
