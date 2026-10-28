'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { TranslationKey } from '@/lib/i18n';
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

type NoteStatus = 'ready' | 'dispatched' | 'delivered' | 'failed';
type Note = {
  id: string;
  documentNumber: string;
  orderNumber: string;
  clientName: string;
  status: NoteStatus;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  createdAt: string;
  lines: { id: string; sku: string; name: string; quantity: number }[];
  totalMad: number;
};

const STATUS_KEYS: Record<NoteStatus, TranslationKey> = {
  ready: 'deliveryReady',
  dispatched: 'deliveryDispatched',
  delivered: 'delivered',
  failed: 'deliveryFailed',
};
const STATUS_BADGE: Record<NoteStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  ready: 'secondary',
  dispatched: 'warning',
  delivered: 'success',
  failed: 'destructive',
};

export function LiveDeliveriesPage() {
  const { t, locale } = useLocale();
  const [notes, setNotes] = useState<Note[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failTarget, setFailTarget] = useState<Note | null>(null);
  const [reason, setReason] = useState('');
  const [shortTarget, setShortTarget] = useState<Note | null>(null);
  const [missing, setMissing] = useState<Record<string, string>>({});
  const [shortReason, setShortReason] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/deliveries', { cache: 'no-store' });
      if (!response.ok) throw new Error('load');
      const result = await response.json() as { notes: Note[]; canManage: boolean };
      setNotes(result.notes);
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

  async function act(noteId: string, body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusyId(noteId);
    setMessage(null);
    try {
      const response = await fetch('/api/operations/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, ...body }),
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
      setBusyId(null);
    }
  }

  if (loading) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-subtle" role="status">{t('loadingDeliveries')}</p>;
  if (loadError) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-destructive" role="alert">{t('mapLoadError')} <Button type="button" variant="link" onClick={() => { setLoading(true); void load(); }}>{t('retry')}</Button></p>;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <p className="m-0 text-xs text-subtle">{notes.length} {t('totalRecords')}{canManage ? ` · ${t('deliveryCreateHint')}` : ''}</p>
      {message && <p className={`m-0 rounded-md border p-3 text-xs ${message.tone === 'ok' ? 'border-success bg-secondary text-success' : 'border-destructive bg-destructive-soft text-destructive'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
      {notes.length === 0 ? <p className="m-0 text-xs text-subtle">{t('noDeliveriesYet')}</p> : (
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <Table className="w-full min-w-max text-start text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>{t('deliveryNoteNumber')}</TableHead>
                <TableHead>{t('orderNumber')}</TableHead>
                <TableHead>{t('customerOrStore')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('orderLines')}</TableHead>
                <TableHead>{t('total')}</TableHead>
                <TableHead>{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((note) => (
                <TableRow key={note.id}>
                  <TableCell><strong dir="ltr">{note.documentNumber}</strong></TableCell>
                  <TableCell dir="ltr">{note.orderNumber}</TableCell>
                  <TableCell>{note.clientName}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[note.status]}>{t(STATUS_KEYS[note.status])}</Badge>
                    {note.failureReason && <small className="mt-1 block text-caption text-subtle">{note.failureReason}</small>}
                  </TableCell>
                  <TableCell>{note.lines.map((line) => `${line.name} × ${line.quantity}`).join(', ')}</TableCell>
                  <TableCell>{formatMad(note.totalMad, locale)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {note.status === 'ready' && <Button type="button" variant="primary" size="sm" disabled={busyId === note.id} onClick={() => void act(note.id, { action: 'dispatch' }, t('deliveryDispatchedOk'))}>{t('dispatchAction')}</Button>}
                      {note.status === 'dispatched' && <Button type="button" variant="primary" size="sm" disabled={busyId === note.id} onClick={() => void act(note.id, { action: 'deliver' }, t('deliveryDeliveredOk'))}>{t('markDeliveredAction')}</Button>}
                      {note.status === 'dispatched' && <Button type="button" variant="secondary" size="sm" disabled={busyId === note.id} onClick={() => { setMissing({}); setShortReason(''); setShortTarget(note); }}>{t('shortDeliver')}</Button>}
                      {(note.status === 'ready' || note.status === 'dispatched') && <Button type="button" variant="secondary" size="sm" disabled={busyId === note.id} onClick={() => { setReason(''); setFailTarget(note); }}>{t('markFailed')}</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={shortTarget !== null} onOpenChange={(open) => { if (!open) setShortTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t('shortDeliver')} · {shortTarget?.documentNumber}</DialogTitle><DialogDescription>{t('shortHint')}</DialogDescription></DialogHeader>
          <DialogBody className="grid gap-3">
            {shortTarget?.lines.map((line) => (
              <Label key={line.id} className="grid grid-cols-[1fr_96px] items-center gap-2 text-xs text-foreground">
                <span>{line.name} <span className="text-subtle">× {line.quantity}</span></span>
                <Input type="number" min={0} max={line.quantity} step={1} placeholder="0" aria-label={`${t('shortMissing')}: ${line.name}`} value={missing[line.id] ?? ''} onChange={(event) => setMissing((current) => ({ ...current, [line.id]: event.target.value }))} />
              </Label>
            ))}
            <Label className="grid gap-1 text-caption text-subtle">{t('shortReason')}<Textarea maxLength={300} value={shortReason} onChange={(event) => setShortReason(event.target.value)} /></Label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setShortTarget(null)}>{t('close')}</Button>
            {(() => {
              const shortages = (shortTarget?.lines ?? [])
                .map((line) => ({ lineId: line.id, quantity: Number(missing[line.id] || 0), max: line.quantity }))
                .filter((entry) => entry.quantity !== 0);
              const valid = shortages.length > 0 && shortages.every((entry) => Number.isInteger(entry.quantity) && entry.quantity > 0 && entry.quantity <= entry.max);
              return (
                <Button type="button" variant="primary" disabled={!valid || shortReason.trim() === '' || busyId !== null} onClick={() => {
                  if (!shortTarget) return;
                  void act(shortTarget.id, { action: 'deliver', shortages: shortages.map(({ lineId, quantity }) => ({ lineId, quantity })), reason: shortReason.trim() }, t('shortDone')).then((ok) => { if (ok) setShortTarget(null); });
                }}>{t('shortConfirm')}</Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={failTarget !== null} onOpenChange={(open) => { if (!open) setFailTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('markFailed')} {failTarget?.documentNumber}</DialogTitle><DialogDescription>{t('failDeliveryHint')}</DialogDescription></DialogHeader>
          <DialogBody>
            <Label className="grid gap-1 text-caption text-subtle">
              {t('failureReason')}
              <Textarea maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setFailTarget(null)}>{t('close')}</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={reason.trim() === '' || busyId !== null}
              onClick={() => {
                if (!failTarget) return;
                void act(failTarget.id, { action: 'fail', reason }, t('deliveryFailedOk')).then((ok) => { if (ok) setFailTarget(null); });
              }}
            >{t('markFailed')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
