'use client';

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
  return candidate?.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
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
    <main className="auth-page" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="auth-topline">
        <Link href="/" className="auth-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>{text.brand}</strong><small>OPERATIONS</small></span></Link>
        <button className="auth-locale" type="button" onClick={() => { const next = locale === 'en' ? 'ar' : 'en'; setLocale(next); window.localStorage.setItem('elbaraka-locale-v1', next); }}>{text.locale}</button>
      </div>
      <section className="auth-content">
        <div className="auth-icon"><KeyRound size={20} /></div>
        <p className="auth-eyebrow">ELBARAKA OPERATIONS</p>
        <h1>{text.title}</h1>
        <p className="auth-intro">{text.intro}</p>
        {queryError === 'no-workspace-access' && <p className="auth-error" role="alert">{text.noAccess}</p>}
        {!configured && <p className="auth-warning" role="status">{text.missing}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form className="auth-form" onSubmit={submit}>
          <label className="field"><span>{text.email}</span><input name="email" type="email" autoComplete="username" inputMode="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="field"><span>{text.password}</span><input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="button button-primary auth-submit" type="submit" disabled={!configured || submitting}>{submitting ? `${text.submit}…` : text.submit}</button>
        </form>
        <Link className="auth-back" href="/"><ArrowLeft size={15} />{text.back}</Link>
      </section>
    </main>
  );
}