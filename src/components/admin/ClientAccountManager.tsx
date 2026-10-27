'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLocale } from './LocaleContext';

type CustomerAccount = {
  userId: string;
  fullName: string;
  email: string;
  active: boolean;
  createdAt: string;
};

type Invitation = {
  mode: 'generate' | 'send_email';
  email: string;
  expiresAt: string;
  code?: string;
  link?: string;
};

export function ClientAccountManager({ clientId, clientName, clientActive }: { clientId: string; clientName: string; clientActive: boolean }) {
  const { t, locale } = useLocale();
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'generate' | 'send_email'>('generate');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resettingUserId, setResettingUserId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/customer-accounts?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' });
      const result = await response.json() as { accounts?: CustomerAccount[]; error?: string };
      if (!response.ok || !result.accounts) throw new Error(result.error || 'Could not load client accounts.');
      setAccounts(result.accounts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load client accounts.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const issueInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setInvitation(null);
    try {
      const response = await fetch('/api/admin/customer-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, email: email.trim(), mode }),
      });
      const result = await response.json() as { invitation?: Invitation; error?: string };
      if (!response.ok || !result.invitation) throw new Error(result.error || 'Could not create the customer invitation.');
      if (result.invitation.mode === 'generate') {
        setInvitation(result.invitation);
        setNotice(t('customerCodeReady'));
      } else {
        setEmail('');
        setNotice(t('customerInviteCreated'));
      }
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'Could not create the customer invitation.');
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordReset = async (userId: string) => {
    setResettingUserId(userId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/customer-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, userId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not send the password reset email.');
      setNotice(t('customerPasswordResetSent'));
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not send the password reset email.');
    } finally {
      setResettingUserId('');
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(t('customerInviteCopied'));
    } catch {
      setError(t('customerInviteCopyError'));
    }
  };

  return (
    <div className="grid gap-4 rounded-md border border-border bg-background p-3 sm:p-4">
      <div>
        <h3 className="m-0 text-sm font-bold">{t('customerAccountDetails')}: {clientName}</h3>
        <p className="mb-0 mt-1 text-xs text-muted-foreground">{t('customerAccountSeparation')}</p>
      </div>
      {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
      {notice && <p className="m-0 text-xs text-success" role="status">{notice}</p>}
      {loading ? <p className="m-0 text-xs text-muted-foreground" role="status">{t('loadingClients')}</p>
        : accounts.length === 0
          ? <p className="m-0 text-xs text-muted-foreground">{t('noCustomerAccounts')}</p>
          : <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader><TableRow><TableHead>{t('customerAccountName')}</TableHead><TableHead>{t('customerEmailRequired')}</TableHead><TableHead>{t('status')}</TableHead><TableHead>{t('actions')}</TableHead></TableRow></TableHeader>
              <TableBody>{accounts.map((account) => <TableRow key={account.userId}>
                <TableCell>{account.fullName}</TableCell>
                <TableCell dir="ltr">{account.email}</TableCell>
                <TableCell>{account.active && clientActive ? t('active') : t('inactive')}</TableCell>
                <TableCell><Button type="button" variant="outline" size="sm" disabled={!account.active || !clientActive || Boolean(resettingUserId)} onClick={() => void sendPasswordReset(account.userId)}>{resettingUserId === account.userId ? t('saving') : t('sendPasswordReset')}</Button></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>}
      {clientActive && <form className="grid items-end gap-3 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(200px,0.8fr)_auto]" onSubmit={(event) => void issueInvitation(event)}>
        <Label className="grid gap-1 text-xs font-medium">{t('customerEmailRequired')}
          <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required dir="ltr" />
        </Label>
        <Label className="grid gap-1 text-xs font-medium">{t('customerInviteMethod')}
          <Select value={mode} onValueChange={(value) => {
            if (value === 'generate' || value === 'send_email') setMode(value);
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="generate">{t('generateInviteCode')}</SelectItem>
              <SelectItem value="send_email">{t('sendInviteEmail')}</SelectItem>
            </SelectContent>
          </Select>
        </Label>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? t('saving') : mode === 'generate' ? t('generateInviteCode') : t('sendInviteEmail')}</Button>
      </form>}
      {invitation?.code && invitation.link && (
        <div className="grid gap-2 rounded-md border border-dashed border-border p-3 text-xs">
          <p className="m-0">{t('customerInviteExpires')}: {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'en-MA', { dateStyle: 'medium' }).format(new Date(invitation.expiresAt))}</p>
          <Label className="grid gap-1">{t('customerInviteCode')}
            <span className="flex gap-2"><Input readOnly value={invitation.code} dir="ltr" /><Button type="button" variant="outline" onClick={() => void copy(invitation.code!)}>{t('copyCustomerInvite')}</Button></span>
          </Label>
          <Label className="grid gap-1">{t('customerInviteLink')}
            <span className="flex gap-2"><Input readOnly value={invitation.link} dir="ltr" /><Button type="button" variant="outline" onClick={() => void copy(invitation.link!)}>{t('copyCustomerInviteLink')}</Button></span>
          </Label>
        </div>
      )}
      {!loading && <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => void loadAccounts()}>{t('retry')}</Button>}
    </div>
  );
}
