'use client';

import { LogOut, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from './LocaleContext';

export type MobileNavItem = { id: string; label: string; href: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; badge?: number };

const PREFERRED: Record<string, string[]> = {
  manager: ['overview', 'catalog', 'inventory', 'recipes'],
  purchasing: ['overview', 'inventory', 'recipes', 'purchasing'],
  delivery: ['overview', 'deliveries', 'map', 'orders'],
};

// App-style bottom tab bar (phones only). "More" opens a bottom sheet with every page.
export function MobileNav({ items, current, role, onSignOut, signingOut }: {
  items: MobileNavItem[];
  current: string;
  role: string;
  onSignOut?: () => void;
  signingOut?: boolean;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const preferred = PREFERRED[role] ?? [];
  const primary = [
    ...preferred.map((id) => items.find((item) => item.id === id)).filter((item): item is MobileNavItem => Boolean(item)),
    ...items.filter((item) => !preferred.includes(item.id)),
  ].slice(0, 4);
  const inMore = !primary.some((item) => item.id === current);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur min-[761px]:hidden"
        aria-label={t('navigation')}
      >
        {primary.map((item) => {
          const Icon = item.icon;
          const active = item.id === current;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold no-underline transition-colors ${active ? 'text-primary' : 'text-subtle'}`}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
              <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
              <span className="max-w-full truncate">{item.label}</span>
              {item.badge ? <i className="absolute end-[calc(50%-20px)] top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[9px] font-bold not-italic text-accent-foreground">{item.badge}</i> : null}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={`flex min-h-[58px] flex-col items-center justify-center gap-1 border-0 bg-transparent px-1 text-[10px] font-semibold ${inMore ? 'text-primary' : 'text-subtle'}`}
        >
          <MoreHorizontal size={21} strokeWidth={inMore ? 2.2 : 1.8} />
          <span>{t('more')}</span>
        </button>
      </nav>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader><DialogTitle>{t('navigation')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-2.5 p-4">
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.id === current;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative grid min-h-[84px] place-items-center content-center gap-1.5 rounded-2xl border p-2 text-center text-xs font-semibold no-underline ${active ? 'border-primary bg-secondary text-primary' : 'border-border bg-background text-foreground'}`}
                >
                  <Icon size={22} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.badge ? <i className="absolute end-2 top-2 min-w-4 rounded-full bg-accent px-1 text-center text-[9px] font-bold not-italic text-accent-foreground">{item.badge}</i> : null}
                </Link>
              );
            })}
          </div>
          {onSignOut && (
            <div className="border-t border-border p-4">
              <Button type="button" variant="outline" className="w-full gap-2" disabled={signingOut} onClick={onSignOut}><LogOut size={16} />{t('signOut')}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
