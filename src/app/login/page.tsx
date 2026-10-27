'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { FormEvent, useState } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

const labels = {
  en: {
    brand: 'Elbaraka Epices',
    title: 'Sign in to operations',
    intro: 'Use the account invitation sent by your administrator.',
    email: 'Work email',
    password: 'Password',
    submit: 'Sign in',
    missing: 'Supabase is not configured. Set the public project URL and key in .env.local, then restart the app.',
    invalid: 'We could not sign you in. Check your email, password, and invitation status.',
    noAccess: 'This account has no active Elbaraka workspace membership. Ask the manager to invite you.',
    back: 'Back to preview',
    locale: 'العربية',
  },
  ar: {
    brand: 'البركة للتوابل',
    title: 'تسجيل الدخول إلى العمليات',
    intro: 'استخدم الحساب الذي أرسلت دعوته من طرف المسؤول.',
    email: 'البريد الإلكتروني للعمل',
    password: 'كلمة المرور',
    submit: 'تسجيل الدخول',
    missing: 'لم يتم إعداد Supabase. أضف رابط المشروع والمفتاح العام إلى .env.local ثم أعد تشغيل التطبيق.',
    invalid: 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور وحالة الدعوة.',
    noAccess: 'لا توجد صلاحية نشطة لهذا الحساب في مساحة عمل البركة. اطلب من المدير إرسال دعوة.',
    back: 'العودة إلى المعاينة',
    locale: 'English',
  },
} as const;

function safeNextPath() {
  const candidate = new URLSearchParams(window.location.search).get('next');
  return candidate?.startsWith('/') && !candidate.startsWith('//') ? candidate : '/staff';
}

export default function LoginPage() {
  const [locale, setLocale] = useState<'en' | 'ar'>(() => {
    if (typeof window === 'undefined') return 'en';
    return window.localStorage.getItem('elbaraka-locale-v1') === 'ar' ? 'ar' : 'en';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const configured = Boolean(getSupabasePublicConfig());
  const text = labels[locale];
  const queryError = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('error');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(text.invalid);
        return;
      }
      window.location.assign(safeNextPath());
    } catch {
      setError(text.invalid);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-background px-4 py-5 text-foreground sm:px-6" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <Link href={configured ? '/login' : '/'} className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="relative flex size-[30px] rotate-[-5deg] items-center justify-center gap-0.5 overflow-hidden rounded-lg rounded-bl-[3px] bg-primary" aria-hidden="true">
            <span className="h-[13px] w-1 rotate-[24deg] rounded-full bg-accent-foreground" />
            <span className="h-[18px] w-1 rotate-[24deg] rounded-full bg-primary-foreground" />
            <span className="h-[11px] w-1 rotate-[24deg] rounded-full bg-destructive" />
          </span>
          <span className="grid gap-0.5">
            <strong className="text-sm font-bold text-[#124b38] sm:text-base">{text.brand}</strong>
            <small className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">OPERATIONS</small>
          </span>
        </Link>
        <Button variant="outline" size="sm" type="button" onClick={() => { const next = locale === 'en' ? 'ar' : 'en'; setLocale(next); window.localStorage.setItem('elbaraka-locale-v1', next); }}>{text.locale}</Button>
      </header>
      <section className="flex flex-1 items-center justify-center py-10">
        <Card className="w-full max-w-md overflow-hidden rounded-xl shadow-[0_18px_55px_rgb(24_45_36_/_10%)]">
          <CardHeader className="items-center gap-3 px-6 pb-5 pt-8 text-center sm:px-8">
            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary" aria-hidden="true"><KeyRound size={19} /></span>
            <div className="grid gap-2">
              <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">ELBARAKA OPERATIONS</p>
              <CardTitle className="text-xl sm:text-2xl">{text.title}</CardTitle>
            </div>
            <CardDescription className="max-w-sm leading-relaxed">{text.intro}</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-7 sm:px-8">
            {queryError === 'no-workspace-access' && <p className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive" role="alert">{text.noAccess}</p>}
            {!configured && <p className="mb-4 rounded-md border border-accent-foreground/30 bg-accent p-3 text-sm leading-relaxed text-accent-foreground" role="status">{text.missing}</p>}
            {error && <p className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive" role="alert">{error}</p>}
            <form className="grid gap-4" onSubmit={submit}>
              <Label className="grid gap-2 text-sm font-medium">{text.email}<Input className="h-10 text-sm" name="email" type="email" autoComplete="username" inputMode="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required /></Label>
              <Label className="grid gap-2 text-sm font-medium">{text.password}<Input className="h-10 text-sm" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Label>
              <Button variant="primary" size="lg" className="mt-1 w-full" type="submit" disabled={!configured || submitting}>{submitting ? `${text.submit}…` : text.submit}</Button>
            </form>
            {!configured && <div className="mt-5 flex justify-center border-t border-border pt-4">
              <Link className="inline-flex items-center gap-2 rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/"><ArrowLeft size={15} />{text.back}</Link>
            </div>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}