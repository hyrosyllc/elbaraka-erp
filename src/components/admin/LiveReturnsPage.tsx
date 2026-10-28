'use client';

import { formatMad } from '@/lib/workspace';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { TranslationKey } from '@/lib/i18n';
import { useLocale } from './LocaleContext';

type ReturnStatus = 'requested' | 'inspection' | 'released' | 'rejected';
type ReturnRow = {
  id: string;
  documentNumber: string;
  noteNumber: string;
  clientName: string;
  reason: string;
  status: ReturnStatus;
  resolutionNote: string;
  creditMad: number;
  stock: { restocked: number; rejected: number } | null;
  hasInvoice: boolean;
  lines: { name: string; sku: string; quantity: number }[];
};
type Returnable = {
  noteId: string;
  documentNumber: string;
  clientName: string;
  lines: { id: string; sku: string; name: string; remaining: number }[];
};

const STATUS_KEYS: Record<ReturnStatus, TranslationKey> = { requested: 'requested', inspection: 'inspection', released: 'released', rejected: 'rejected' };
const STATUS_BADGE: Record<ReturnStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = { requested: 'secondary', inspection: 'warning', released: 'success', rejected: 'destructive' };

export function LiveReturnsPage() {
  const { t } = useLocale();
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [returnable, setReturnable] = useState<Returnable[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [noteId, setNoteId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [resolveTarget, setResolveTarget] = useState<{ row: ReturnRow; decision: 'release' | 'reject' } | null>(null);
  const [issueCredit, setIssueCredit] = useState(true);
  const [resolutionNote, setResolutionNote] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/returns', { cache: 'no-store' });
      if (!response.ok) throw new Error('load');
      const result = await response.json() as { returns: ReturnRow[]; returnable: Returnable[]; canManage: boolean };
      setReturns(result.returns);
      setReturnable(result.returnable);
      setCanManage(result.canManage);
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
      const response = await fetch('/api/operations/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; credit?: { status: string } };
      if (!response.ok) {
        setMessage({ tone: 'error', text: result.error ?? t('mapActionFailed') });
        return false;
      }
      setMessage(result.credit?.status === 'failed' ? { tone: 'error', text: t('returnCreditFailed') } : { tone: 'ok', text: okText });
      await load();
      return true;
    } catch {
      setMessage({ tone: 'error', text: t('mapActionFailed') });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const selectedNote = returnable.find((note) => note.noteId === noteId);
  const chosenLines = selectedNote
    ? selectedNote.lines.map((line) => ({ deliveryLineId: line.id, quantity: Number(quantities[line.id] ?? '0'), remaining: line.remaining })).filter((line) => line.quantity > 0)
    : [];
  const linesValid = chosenLines.length > 0 && chosenLines.every((line) => Number.isInteger(line.quantity) && line.quantity <= line.remaining);

  if (loading) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingReturns')}</p>;
  if (loadError) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">{t('mapLoadError')} <Button type="button" variant="link" onClick={() => { setLoading(true); void load(); }}>{t('retry')}</Button></p>;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-subtle">{t('pendingInspection')}</p>
        <Button type="button" variant="primary" size="sm" disabled={returnable.length === 0} onClick={() => { setNoteId(''); setQuantities({}); setReason(''); setCreating(true); }}>{t('requestReturn')}</Button>
      </div>
      {message && <p className={`m-0 rounded-md border p-3 text-xs ${message.tone === 'ok' ? 'border-success bg-secondary text-success' : 'border-destructive bg-destructive-soft text-destructive'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}

      {returns.length === 0 ? <p className="m-0 text-xs text-subtle">{t('noReturns')}</p> : (
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <Table className="w-full min-w-max text-start text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>{t('returnNumber')}</TableHead>
                <TableHead>{t('deliveryNumber')}</TableHead>
                <TableHead>{t('customerOrStore')}</TableHead>
                <TableHead>{t('orderLines')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><strong dir="ltr">{row.documentNumber}</strong></TableCell>
                  <TableCell dir="ltr">{row.noteNumber}</TableCell>
                  <TableCell>{row.clientName}<small className="block text-caption text-subtle">{row.reason}</small></TableCell>
                  <TableCell>{row.lines.map((line) => `${line.name} × ${line.quantity}`).join(', ')}
                    {row.stock && <div className="mt-1 flex gap-1">{row.stock.restocked > 0 && <Badge variant="success">{t('returnRestocked')} {row.stock.restocked}</Badge>}{row.stock.rejected > 0 && <Badge variant="destructive">{t('returnWrittenOff')} {row.stock.rejected}</Badge>}</div>}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[row.status]}>{t(STATUS_KEYS[row.status])}</Badge>
                    {row.resolutionNote && <small className="mt-1 block text-caption text-subtle">{row.resolutionNote}</small>}
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <div className="flex flex-wrap gap-1.5">
                        {row.status === 'requested' && <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => void post({ action: 'receive', returnId: row.id }, t('returnReceivedOk'))}>{t('receiveReturnAction')}</Button>}
                        {row.status === 'inspection' && <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => { setResolutionNote(''); setResolveTarget({ row, decision: 'release' }); }}>{t('releaseReturn')}</Button>}
                        {row.status === 'inspection' && <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => { setResolutionNote(''); setResolveTarget({ row, decision: 'reject' }); }}>{t('rejectReturn')}</Button>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t('requestReturn')}</DialogTitle><DialogDescription>{t('returnQuantityHint')}</DialogDescription></DialogHeader>
          <DialogBody className="grid gap-3">
            <Select value={noteId} onValueChange={(value) => { setNoteId(value); setQuantities({}); }}>
              <SelectTrigger><SelectValue placeholder={t('selectDelivery')} /></SelectTrigger>
              <SelectContent>{returnable.map((note) => <SelectItem key={note.noteId} value={note.noteId}>{note.documentNumber} · {note.clientName}</SelectItem>)}</SelectContent>
            </Select>
            {selectedNote?.lines.map((line) => (
              <Label key={line.id} className="grid grid-cols-[1fr_90px] items-center gap-2 text-xs">
                <span>{line.name} <small className="text-subtle">({t('returnableUpTo')} {line.remaining})</small></span>
                <Input type="number" min={0} max={line.remaining} step={1} value={quantities[line.id] ?? ''} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} />
              </Label>
            ))}
            <Label className="grid gap-1 text-caption text-subtle">{t('returnReasonLabel')}<Textarea maxLength={300} placeholder={t('returnReason')} value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>{t('close')}</Button>
            <Button type="button" variant="primary" disabled={busy || !selectedNote || !linesValid || reason.trim() === ''} onClick={() => {
              void post({ action: 'create', noteId, reason, lines: chosenLines.map(({ deliveryLineId, quantity }) => ({ deliveryLineId, quantity })), idempotencyKey: crypto.randomUUID() }, t('returnRequestedOk')).then((ok) => { if (ok) setCreating(false); });
            }}>{t('requestReturn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resolveTarget !== null} onOpenChange={(open) => { if (!open) setResolveTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{resolveTarget?.decision === 'release' ? t('releaseReturn') : t('rejectReturn')} · {resolveTarget?.row.documentNumber}</DialogTitle><DialogDescription>{resolveTarget?.decision === 'release' ? t('releaseReturnHint') : t('rejectReturnHint')}</DialogDescription></DialogHeader>
          <DialogBody>
            {resolveTarget?.decision === 'release' && (resolveTarget.row.hasInvoice
              ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={issueCredit} onChange={(event) => setIssueCredit(event.target.checked)} />{t('returnIssueCredit')} · {formatMad(resolveTarget.row.creditMad)}</label>
              : <p className="m-0 text-caption text-subtle">{t('returnNoInvoice')}</p>)}
            <Label className="grid gap-1 text-caption text-subtle">{t('inspectionNote')}<Textarea maxLength={300} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} /></Label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setResolveTarget(null)}>{t('close')}</Button>
            <Button type="button" variant={resolveTarget?.decision === 'reject' ? 'destructive' : 'primary'} disabled={busy} onClick={() => {
              if (!resolveTarget) return;
              void post({ action: resolveTarget.decision, returnId: resolveTarget.row.id, note: resolutionNote, issueCredit: issueCredit && resolveTarget.row.hasInvoice }, resolveTarget.decision === 'release' ? t('returnReleasedOk') : t('returnRejectedOk')).then((ok) => { if (ok) setResolveTarget(null); });
            }}>{resolveTarget?.decision === 'release' ? t('releaseReturn') : t('rejectReturn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
