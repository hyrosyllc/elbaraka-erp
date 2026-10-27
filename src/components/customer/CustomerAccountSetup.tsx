'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

const copy = {
  en: {
    title: 'Finish setting up your account',
    intro: 'Choose a password to make future sign-ins easier.',
    existingIntro: 'Your verified account will be linked to this store. Continue using your existing password.',
    name: 'Your name',
    password: 'Password (at least 8 characters)',
    confirm: 'Confirm password',
    submit: 'Create customer account',
    loading: 'Setting up…',
    invalid: 'This invitation is invalid or has expired. Ask Elbaraka for a new invitation.',
    mismatch: 'The passwords do not match.',
    failed: 'We could not finish setting up your account. Please try again.',
  },
  ar: {
    title: 'أكمل إعداد حسابك',
    intro: 'اختر كلمة مرور لتسهيل تسجيل الدخول مستقبلا.',
    existingIntro: 'سيتم ربط حسابك المؤكد بهذا المتجر. تابع استخدام كلمة المرور الحالية.',
    name: 'اسمك',
    password: 'كلمة المرور (٨ أحرف على الأقل)',
    confirm: 'تأكيد كلمة المرور',
    submit: 'إنشاء حساب العميل',
    loading: 'جار الإعداد…',
    invalid: 'الدعوة غير صالحة أو منتهية. اطلب دعوة جديدة من البركة.',
    mismatch: 'كلمتا المرور غير متطابقتين.',
    failed: 'تعذر إعداد الحساب. حاول مرة أخرى.',
  },
} as const;

export function CustomerAccountSetup() {
  const [locale, setLocale] = useState<'en' | 'ar'>('ar');
  const [inviteCode, setInviteCode] = useState('');
  const [existingAccount, setExistingAccount] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const text = copy[locale];

  useEffect(() => {
    if (window.localStorage.getItem('elbaraka-locale-v1') === 'en') setLocale('en');
    const params = new URLSearchParams(window.location.search);
    setInviteCode(params.get('inviteCode') ?? '');
    setFullName((params.get('inviteName') ?? '').slice(0, 120));
    setExistingAccount(params.get('existingAccount') === '1');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[A-Za-z0-9_-]{32}$/.test(inviteCode)) {
      setError(text.invalid);
      return;
    }
    if (!existingAccount && password !== confirmation) {
      setError(text.mismatch);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (!existingAccount) {
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) throw new Error('password');
      }

      const response = await fetch('/api/customer/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode, fullName: fullName.trim() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'enrollment');
      window.location.assign('/');
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message === 'enrollment' ? text.invalid : text.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{text.title}</CardTitle>
          <CardDescription>{existingAccount ? text.existingIntro : text.intro}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
            <Label className="grid gap-2 text-sm font-medium">{text.name}
              <Input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} required />
            </Label>
            {!existingAccount && <>
              <Label className="grid gap-2 text-sm font-medium">{text.password}
                <Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} required />
              </Label>
              <Label className="grid gap-2 text-sm font-medium">{text.confirm}
                <Input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} maxLength={72} required />
              </Label>
            </>}
            {error && <p className="m-0 text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy}>{busy ? text.loading : text.submit}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
