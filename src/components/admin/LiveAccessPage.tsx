'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { INITIAL_ROLE_ACCESS, type WorkspacePage, type WorkspaceRole } from '@/lib/workspace';
import { PAGE_LABEL_KEYS, ROLE_LABEL_KEYS, type TranslationKey } from '@/lib/i18n';
import { useLocale } from './LocaleContext';

const ROLES: WorkspaceRole[] = ['manager', 'purchasing', 'delivery'];

export function LiveAccessPage() {
  const { t } = useLocale();
  return (
    <div className="grid gap-[18px]">
      <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-[21px] py-5">
        <p className="m-0 text-xs text-muted-foreground">{t('accessLiveNote')}</p>
        <Button asChild size="sm"><Link href="/admin/users">{t('manageUsersLink')}</Link></Button>
      </Card>
      <div className="grid gap-3 min-[921px]:grid-cols-3">
        {ROLES.map((role) => (
          <Card key={role} className="grid content-start gap-2 rounded-[9px] border border-border bg-card px-[21px] py-5">
            <h2 className="m-0 text-base font-bold">{t(ROLE_LABEL_KEYS[role] as TranslationKey)}</h2>
            <div className="flex flex-wrap gap-1.5">
              {INITIAL_ROLE_ACCESS[role].map((page: WorkspacePage) => (
                <Badge key={page} variant="secondary">{t(PAGE_LABEL_KEYS[page])}</Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
