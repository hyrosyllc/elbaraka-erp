'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

type Invoice = { id: string; documentNumber: string; issuedAt: string; dueDate: string | null; totalMad: number; paidMad: number; adjustmentsMad: number; balanceMad: number; overdue: boolean; adjustments: { kind: string; amountMad: number; description: string }[] };
type Statement = { invoices: Invoice[]; balanceMad: number; dueMad: number; overdueMad: number };

const COPY = {
  en: { title: 'Invoices & balance', due: 'Amount due', overdue: 'Overdue', credit: 'Credit available', total: 'Total', paid: 'Paid', adjustments: 'Returns & credits', balance: 'Balance', none: 'No invoices yet.', failed: 'Could not load your account.', dueDate: 'Due', settled: 'Settled' },
  ar: { title: 'الفواتير والرصيد', due: 'المبلغ المستحق', overdue: 'متأخر', credit: 'رصيد متاح', total: 'الإجمالي', paid: 'المدفوع', adjustments: 'المرتجعات والأرصدة', balance: 'المتبقي', none: 'لا توجد فواتير بعد.', failed: 'تعذر تحميل حسابك.', dueDate: 'الاستحقاق', settled: 'مسدّدة' },
} as const;

export function CustomerAccountStatement({ clientId, locale }: { clientId: string; locale: 'en' | 'ar' }) {
  const text = COPY[locale];
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState('');
  const fmt = (value: number) => `${value.toLocaleString(locale === 'ar' ? 'ar-MA' : 'en-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;

  useEffect(() => {
    let active = true;
    fetch(`/api/customer/account?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as Statement & { error?: string };
        if (!active) return;
        if (!response.ok) setError(result.error ?? text.failed); else setStatement(result);
      })
      .catch(() => { if (active) setError(text.failed); });
    return () => { active = false; };
  }, [clientId, text.failed]);

  if (error) return <p className="m-0 text-sm text-danger" role="alert">{error}</p>;
  if (!statement) return null;
  const credit = statement.balanceMad < 0 ? -statement.balanceMad : 0;

  return (
    <section className="grid gap-3" aria-label={text.title}>
      <h2 className="text-2xl font-extrabold text-foreground">{text.title}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="m-0 text-label text-muted-foreground">{text.due}</p><p className="m-0 mt-1 text-xl font-bold">{fmt(statement.dueMad)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="m-0 text-label text-muted-foreground">{text.overdue}</p><p className={`m-0 mt-1 text-xl font-bold ${statement.overdueMad > 0 ? 'text-danger' : ''}`}>{fmt(statement.overdueMad)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="m-0 text-label text-muted-foreground">{text.credit}</p><p className="m-0 mt-1 text-xl font-bold">{fmt(credit)}</p></CardContent></Card>
      </div>
      {statement.invoices.length === 0 ? <p className="m-0 text-sm text-muted-foreground">{text.none}</p> : statement.invoices.map((invoice) => (
        <Card key={invoice.id}>
          <CardContent className="grid gap-2 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div><strong dir="ltr">{invoice.documentNumber}</strong><p className="m-0 mt-1 text-label text-muted-foreground">{new Date(invoice.issuedAt).toLocaleDateString(locale === 'ar' ? 'ar-MA' : 'en-MA')}{invoice.dueDate ? ` · ${text.dueDate} ${invoice.dueDate}` : ''}</p></div>
              <span className={`rounded-full px-3 py-1 text-label font-bold ${invoice.overdue ? 'bg-destructive/15 text-danger' : invoice.balanceMad <= 0 ? 'bg-secondary text-secondary-foreground' : 'bg-accent text-accent-foreground'}`}>{invoice.balanceMad <= 0 ? text.settled : fmt(invoice.balanceMad)}</span>
            </div>
            <div className="flex justify-between"><span>{text.total}</span><strong>{fmt(invoice.totalMad)}</strong></div>
            {invoice.adjustmentsMad !== 0 && <div className="flex justify-between"><span>{text.adjustments}</span><strong>{fmt(invoice.adjustmentsMad)}</strong></div>}
            <div className="flex justify-between"><span>{text.paid}</span><strong>{fmt(invoice.paidMad)}</strong></div>
            <div className="flex justify-between border-t pt-2"><span>{text.balance}</span><strong>{fmt(invoice.balanceMad)}</strong></div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
