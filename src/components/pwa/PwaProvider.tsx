'use client';

import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { OPEN_INSTALL_EVENT, promptInstall, useInstallApp } from './install';

const DISMISS_KEY = 'elbaraka-install-dismissed-v1';
const COPY = {
  en: { title: 'Install Elbaraka', body: 'Add it to your home screen for a full-screen app that opens fast.', install: 'Install', later: 'Not now', iosBody: 'Tap Share, then “Add to Home Screen”.', manualBody: 'Open your browser menu and choose “Install app” or “Add to Home Screen”.' },
  ar: { title: 'ثبّت تطبيق البركة', body: 'أضفه إلى الشاشة الرئيسية للحصول على تطبيق بملء الشاشة وفتح أسرع.', install: 'تثبيت', later: 'لاحقًا', iosBody: 'اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».', manualBody: 'افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».' },
} as const;

export function PwaProvider() {
  const { event: installEvent, installed } = useInstallApp();
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [locale, setLocale] = useState<'en' | 'ar'>('en');

  useEffect(() => {
    setLocale(window.localStorage.getItem('elbaraka-locale-v1') === 'ar' ? 'ar' : 'en');
    // Dev chunks are not content-hashed, so the worker would serve stale code there.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }
    // iOS Safari never fires beforeinstallprompt.
    setIosHint(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onOpen = () => {
      setLocale(window.localStorage.getItem('elbaraka-locale-v1') === 'ar' ? 'ar' : 'en');
      setVisible(true);
    };
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
  }, []);

  // First-time visitors get the popup once the browser says the app is installable.
  useEffect(() => {
    if (installEvent && !installed && !window.localStorage.getItem(DISMISS_KEY)) setVisible(true);
  }, [installEvent, installed]);
  useEffect(() => {
    if (iosHint && !installed && !window.localStorage.getItem(DISMISS_KEY)) setVisible(true);
  }, [iosHint, installed]);

  if (!visible || installed) return null;
  const text = COPY[locale];

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };
  const body = installEvent ? text.body : iosHint ? text.iosBody : text.manualBody;

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-[90] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-popover min-[761px]:bottom-4 min-[761px]:end-4 min-[761px]:start-auto min-[761px]:mx-0"
      role="dialog"
      aria-label={text.title}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">{installEvent ? <Download size={18} /> : <Share size={18} />}</span>
      <div className="grid min-w-0 flex-1 gap-1">
        <strong className="text-sm">{text.title}</strong>
        <p className="m-0 text-xs text-muted-foreground">{body}</p>
        {installEvent && (
          <div className="mt-1.5 flex gap-2">
            <Button type="button" variant="primary" size="sm" className="min-h-9" onClick={() => void promptInstall().then(() => setVisible(false))}>{text.install}</Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={dismiss}>{text.later}</Button>
          </div>
        )}
      </div>
      {!installEvent && <Button type="button" variant="ghost" size="icon" aria-label={text.later} onClick={dismiss}><X size={16} /></Button>}
    </div>
  );
}
