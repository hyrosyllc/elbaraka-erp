'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

const copy = {
  en: {
    title: 'Choose a new password',
    intro: 'Enter and confirm your new account password.',
    password: 'New password (at least 8 characters)',
    confirm: 'Confirm new password',
    submit: 'Save new password',
    busy: 'Saving…',
    mismatch: 'The passwords do not match.',
    failed: 'This reset link is invalid or expired. Ask the manager to send another reset email.',
  },
  ar: {
    title: 'اختر كلمة مرور جديدة',
    intro: 'أدخل كلمة المرور الجديدة وأكدها.',
    password: 'كلمة المرور الجديدة (٨ أحرف على الأقل)',
    confirm: 'تأكيد كلمة المرور الجديدة',
    submit: 'حفظ كلمة المرور',
    busy: 'جار الحفظ…',
    mismatch: 'كلمتا المرور غير متطابقتين.',
    failed: 'رابط إعادة التعيين غير صالح أو منتهي. اطلب من المدير إرسال رسالة جديدة.',
  },
} as const;

export function CustomerPasswordReset() {
  const [locale, setLocale] = useState<'en' | 'ar'>('ar');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const text = copy[locale];

  useEffect(() => {
    if (window.localStorage.getItem('elbaraka-locale-v1') === 'en') setLocale('en');
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError(text.mismatch);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      window.location.assign('/');
    } catch {
      setError(text.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>{text.title}</CardTitle><CardDescription>{text.intro}</CardDescription></CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
            <Label className="grid gap-2 text-sm font-medium">{text.password}
              <Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} required />
            </Label>
            <Label className="grid gap-2 text-sm font-medium">{text.confirm}
              <Input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} maxLength={72} required />
            </Label>
            {error && <p className="m-0 text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy}>{busy ? text.busy : text.submit}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
