'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, MailPlus, RefreshCw, Shield, UserRound, UserX } from 'lucide-react';
import { useLocale } from './LocaleContext';
import { WorkspaceRole } from '@/lib/workspace';

type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  role: WorkspaceRole;
  isActive: boolean;
  emailConfirmed: boolean;
  createdAt: string;
};

const roleValues: WorkspaceRole[] = ['manager', 'purchasing', 'delivery'];

export function UserManagement() {
  const { locale } = useLocale();
  const copy = locale === 'ar' ? {
    eyebrow: 'إدارة الحسابات', title: 'مستخدمو مساحة العمل', intro: 'أرسل دعوات للموظفين وحدد دورهم. يجب تأكيد البريد قبل تسجيل الدخول.', invite: 'دعوة مستخدم', name: 'الاسم الكامل', email: 'البريد الإلكتروني للعمل', role: 'الدور', manager: 'المالك / المدير', purchasing: 'المشتريات', delivery: 'التوصيل', send: 'إرسال الدعوة', refresh: 'تحديث', status: 'الحالة', invited: 'الدعوة مرسلة', confirmed: 'البريد مؤكد', active: 'نشط', inactive: 'موقوف', save: 'حفظ', disable: 'إيقاف الوصول', enable: 'إعادة التفعيل', saving: 'جارٍ الحفظ…', loading: 'جارٍ تحميل المستخدمين…', empty: 'لا يوجد مستخدمون بعد.', error: 'تعذر إتمام العملية. تحقق من الإعدادات أو حاول مرة أخرى.', successInvite: 'تم إرسال الدعوة.', successUpdate: 'تم تحديث العضوية.', ownerOnly: 'تتطلب إدارة المستخدمين دور المالك / المدير.', preview: 'إدارة الحسابات تعمل عبر Supabase Auth بعد إعداد مفتاح الخادم وسياسات العضوية.'
  } : {
    eyebrow: 'Workspace access', title: 'Manage users', intro: 'Invite staff and assign their workspace role. They must confirm their email before sign-in.', invite: 'Invite a user', name: 'Full name', email: 'Work email', role: 'Role', manager: 'Owner / manager', purchasing: 'Purchasing', delivery: 'Delivery', send: 'Send invitation', refresh: 'Refresh', status: 'Status', invited: 'Invitation sent', confirmed: 'Email confirmed', active: 'Active', inactive: 'Inactive', save: 'Save changes', disable: 'Deactivate access', enable: 'Reactivate access', saving: 'Saving…', loading: 'Loading users…', empty: 'No workspace users yet.', error: 'Could not complete the request. Check configuration and try again.', successInvite: 'Invitation sent.', successUpdate: 'Membership updated.', ownerOnly: 'User administration requires the owner/manager role.', preview: 'User administration uses Supabase Auth after the server key and membership policies are configured.'
  };

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('purchasing');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store', signal });
      const payload = await response.json() as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? copy.error);
      setUsers(payload.users ?? []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : copy.error);
    } finally {
      setLoading(false);
    }
  }, [copy.error]);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers]);

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, role }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? copy.error);
      setEmail(''); setFullName(''); setNotice(copy.successInvite);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.error);
    } finally {
      setBusy(false);
    }
  };

  const updateUser = async (user: ManagedUser, changes: Partial<Pick<ManagedUser, 'role' | 'fullName' | 'isActive'>>) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role: changes.role ?? user.role, fullName: changes.fullName ?? user.fullName, isActive: changes.isActive ?? user.isActive }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? copy.error);
      setNotice(copy.successUpdate);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.error);
    } finally {
      setBusy(false);
    }
  };

  return <div className="grid gap-4">
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="m-0 text-caption font-bold text-muted-foreground">{copy.eyebrow}</p><h2 className="mt-1 text-base font-bold tracking-tight text-foreground">{copy.invite}</h2></div><div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-secondary-foreground"><MailPlus size={18} aria-hidden="true" /></div></div>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={invite}>
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{copy.name}</span><Input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} required /></Label>
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{copy.email}</span><Input type="email" autoComplete="off" inputMode="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></Label>
        <Label className="grid min-w-0 gap-1 text-label font-semibold text-muted-foreground"><span>{copy.role}</span><Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roleValues.map((value) => <SelectItem key={value} value={value}>{copy[value]}</SelectItem>)}</SelectContent></Select></Label>
        <Button variant="primary" type="submit" disabled={busy}><MailPlus size={15} />{busy ? copy.saving : copy.send}</Button>
      </form>
      <p className="mb-0 mt-4 text-xs leading-relaxed text-muted-foreground">{copy.preview}</p>
      {notice && <p className="mt-3 rounded-md border border-success/40 bg-secondary p-2.5 text-sm text-secondary-foreground" role="status">{notice}</p>}
      {error && <p className="mt-3 rounded-md border border-destructive/40 bg-destructive-soft p-2.5 text-sm text-destructive" role="alert">{error}</p>}
    </Card>

    <Card className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="m-0 text-caption font-bold text-muted-foreground">{copy.eyebrow}</p><h2 className="mt-1 text-base font-bold tracking-tight text-foreground">{copy.title}</h2></div><Button variant="secondary" onClick={() => void loadUsers()} disabled={loading || busy}><RefreshCw size={15} />{copy.refresh}</Button></div>
      {loading ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground" role="status">{copy.loading}</p> : users.length === 0 ? <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{copy.empty}</p> : <div className="w-full overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>{copy.name}</TableHead><TableHead>{copy.email}</TableHead><TableHead>{copy.role}</TableHead><TableHead>{copy.status}</TableHead><TableHead><span className="sr-only">{copy.save}</span></TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <ManagedUserRow key={user.id} user={user} copy={copy} busy={busy} onUpdate={updateUser} />)}</TableBody></Table></div>}
    </Card>
  </div>;
}

function ManagedUserRow({ user, copy, busy, onUpdate }: {
  user: ManagedUser;
  copy: Record<string, string>;
  busy: boolean;
  onUpdate: (user: ManagedUser, changes: Partial<Pick<ManagedUser, 'role' | 'fullName' | 'isActive'>>) => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<WorkspaceRole>(user.role);
  const roleCopy = copy as Record<WorkspaceRole, string>;
  return <TableRow>
    <TableCell><span className="flex min-w-0 items-center gap-2"><UserRound size={15} className="shrink-0 text-muted-foreground" /><Input aria-label={copy.name} value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} /></span></TableCell>
    <TableCell><span dir="ltr">{user.email}</span></TableCell>
    <TableCell><span className="flex min-w-0 items-center gap-2"><Shield size={14} className="shrink-0 text-muted-foreground" /><Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)}><SelectTrigger aria-label={copy.role}><SelectValue /></SelectTrigger><SelectContent>{roleValues.map((value) => <SelectItem key={value} value={value}>{roleCopy[value]}</SelectItem>)}</SelectContent></Select></span></TableCell>
    <TableCell><div className="grid justify-items-start gap-1"><Badge variant={user.isActive ? 'success' : 'destructive'}>{user.isActive ? copy.active : copy.inactive}</Badge><small className="text-xs text-muted-foreground">{user.emailConfirmed ? copy.confirmed : copy.invited}</small></div></TableCell>
    <TableCell><div className="flex items-center gap-1"><Button variant="ghost" size="icon" type="button" title={copy.save} aria-label={copy.save} disabled={busy || !fullName.trim()} onClick={() => onUpdate(user, { fullName: fullName.trim(), role })}><Check size={16} /></Button><Button variant="ghost" size="icon" type="button" title={user.isActive ? copy.disable : copy.enable} aria-label={user.isActive ? copy.disable : copy.enable} disabled={busy} onClick={() => onUpdate(user, { fullName: fullName.trim(), role, isActive: !user.isActive })}><UserX size={16} /></Button></div></TableCell>
  </TableRow>;
}
