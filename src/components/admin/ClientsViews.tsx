'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Columns3, History, LayoutGrid, List, Mail, Pencil, Search, UserRoundCheck, UserRoundX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TranslationKey } from '@/lib/i18n';
import { clientPath, formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

export type ViewClient = {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  phone: string;
  address: string;
  city: string;
  is_active: boolean;
  account_status?: 'active' | 'invited' | 'none';
  account_count?: number;
  metrics?: {
    invoicedMad: number; paidMad: number; outstandingMad: number; overdueMad: number; creditMad: number;
    orderCount: number; openOrders: number; returnCount: number; lastOrderAt: string | null;
  };
};

type ViewMode = 'list' | 'grid' | 'board' | 'timeline';
type GroupBy = 'balance' | 'account' | 'status' | 'city';
type Balance = 'overdue' | 'owes' | 'credit' | 'settled';

const VIEW_STORAGE_KEY = 'elbaraka-clients-view-v1';
const VIEWS = [
  { id: 'list', key: 'cvViewList', icon: List },
  { id: 'grid', key: 'cvViewGrid', icon: LayoutGrid },
  { id: 'board', key: 'cvViewBoard', icon: Columns3 },
  { id: 'timeline', key: 'cvViewTimeline', icon: History },
] as const satisfies readonly { id: ViewMode; key: TranslationKey; icon: unknown }[];

const BALANCE_KEYS: Record<Balance, TranslationKey> = { overdue: 'cvBalOverdue', owes: 'cvBalOwes', credit: 'cvBalCredit', settled: 'cvBalSettled' };
const BALANCE_ORDER: Balance[] = ['overdue', 'owes', 'credit', 'settled'];
const ACCOUNT_KEYS = { active: 'clientAcctActive', invited: 'clientAcctInvited', none: 'clientAcctNone' } as const satisfies Record<string, TranslationKey>;
const ACCOUNT_ORDER = ['active', 'invited', 'none'] as const;
const ALL = 'all';

function balanceOf(client: ViewClient): Balance {
  const metrics = client.metrics;
  if (!metrics) return 'settled';
  if (metrics.overdueMad > 0) return 'overdue';
  if (metrics.outstandingMad > 0) return 'owes';
  if (metrics.creditMad > 0) return 'credit';
  return 'settled';
}

const accountOf = (client: ViewClient) => client.account_status ?? 'none';

function balanceVariant(balance: Balance): 'destructive' | 'warning' | 'success' | 'secondary' {
  return balance === 'overdue' ? 'destructive' : balance === 'owes' ? 'warning' : balance === 'credit' ? 'success' : 'secondary';
}

function accountVariant(status: 'active' | 'invited' | 'none'): 'success' | 'warning' | 'secondary' {
  return status === 'active' ? 'success' : status === 'invited' ? 'warning' : 'secondary';
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-9 w-auto min-w-[130px] text-xs"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'warning' | 'destructive' | 'success' }) {
  const color = tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-foreground';
  return (
    <Card className="grid gap-0.5 p-3">
      <span className="text-caption text-subtle">{label}</span>
      <strong className={`text-lg ${color}`}>{value}</strong>
      {hint && <small className="text-caption text-subtle">{hint}</small>}
    </Card>
  );
}

function BarList({ title, rows }: { title: string; rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <Card className="grid gap-2 p-3">
      <strong className="text-xs text-foreground">{title}</strong>
      {rows.length === 0 ? <span className="text-xs text-subtle">—</span> : rows.map((row) => (
        <div key={row.label} className="grid gap-1 text-xs">
          <div className="flex justify-between gap-2"><span className="truncate text-muted-foreground">{row.label}</span><span className="shrink-0 text-foreground">{row.display}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} /></div>
        </div>
      ))}
    </Card>
  );
}

type ActionHandlers = {
  canManage: boolean;
  saving: boolean;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
  onAccount: (id: string) => void;
};

function ClientActions({ client, handlers }: { client: ViewClient; handlers: ActionHandlers }) {
  const { t } = useLocale();
  if (!handlers.canManage) return null;
  const toggleLabel = t(client.is_active ? 'clientDeactivate' : 'clientReactivate');
  const buttons = [
    { key: 'edit', label: t('editClient'), icon: <Pencil size={15} />, onClick: () => handlers.onEdit(client.id) },
    { key: 'toggle', label: toggleLabel, icon: client.is_active ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />, onClick: () => handlers.onToggle(client.id) },
    { key: 'account', label: t('customerAccountDetails'), icon: <Mail size={15} />, onClick: () => handlers.onAccount(client.id) },
  ];
  return (
    <div className="flex items-center justify-end gap-0.5">
      {buttons.map((button) => (
        <Button key={button.key} type="button" variant="ghost" size="icon" className="size-8 text-subtle hover:text-primary" disabled={handlers.saving} title={button.label} aria-label={`${button.label}: ${client.name}`} onClick={button.onClick}>{button.icon}</Button>
      ))}
    </div>
  );
}

function ClientBadges({ client }: { client: ViewClient }) {
  const { t } = useLocale();
  const balance = balanceOf(client);
  const account = accountOf(client);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {!client.is_active && <Badge variant="secondary">{t('inactive')}</Badge>}
      {client.metrics && balance !== 'settled' && <Badge variant={balanceVariant(balance)}>{t(BALANCE_KEYS[balance])}</Badge>}
      {client.account_status && <Badge variant={accountVariant(account)}>{t(ACCOUNT_KEYS[account])}{(client.account_count ?? 0) > 1 ? ` ×${client.account_count}` : ''}</Badge>}
    </div>
  );
}

export function ClientsViews({ clients, canManage, saving, onEdit, onToggle, onAccount }: { clients: ViewClient[] } & ActionHandlers) {
  const { t, locale } = useLocale();
  const handlers: ActionHandlers = { canManage, saving, onEdit, onToggle, onAccount };
  const [view, setView] = useState<ViewMode>('list');
  const [groupBy, setGroupBy] = useState<GroupBy>('balance');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [account, setAccount] = useState(ALL);
  const [balance, setBalance] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [sort, setSort] = useState('name');

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored && VIEWS.some((entry) => entry.id === stored)) setView(stored as ViewMode);
  }, []);
  const chooseView = (next: ViewMode) => {
    setView(next);
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* preference only */ }
  };

  const money = (value: number) => formatMad(value, locale);
  const dateLabel = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString(locale === 'ar' ? 'ar-MA' : 'en-GB', { timeZone: 'Africa/Casablanca' }) : '—');
  const cities = useMemo(() => [...new Set(clients.map((client) => client.city.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [clients]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = clients.filter((client) => {
      if (query && ![client.name, client.code, client.contact_name, client.phone, client.city, client.address].some((value) => value.toLowerCase().includes(query))) return false;
      if (status !== ALL && client.is_active !== (status === 'active')) return false;
      if (account !== ALL && accountOf(client) !== account) return false;
      if (balance !== ALL && balanceOf(client) !== balance) return false;
      if (city !== ALL && client.city.trim() !== city) return false;
      return true;
    });
    const metric = (client: ViewClient, pick: (metrics: NonNullable<ViewClient['metrics']>) => number) => (client.metrics ? pick(client.metrics) : 0);
    return list.sort((a, b) => {
      if (sort === 'outstanding') return metric(b, (m) => m.outstandingMad) - metric(a, (m) => m.outstandingMad);
      if (sort === 'revenue') return metric(b, (m) => m.invoicedMad) - metric(a, (m) => m.invoicedMad);
      if (sort === 'orders') return metric(b, (m) => m.orderCount) - metric(a, (m) => m.orderCount);
      if (sort === 'recent') return (b.metrics?.lastOrderAt ?? '').localeCompare(a.metrics?.lastOrderAt ?? '');
      return a.name.localeCompare(b.name);
    });
  }, [clients, search, status, account, balance, city, sort]);

  const analytics = useMemo(() => {
    const withMetrics = clients.filter((client) => client.metrics);
    const total = (pick: (metrics: NonNullable<ViewClient['metrics']>) => number) => withMetrics.reduce((sum, client) => sum + pick(client.metrics!), 0);
    const cityTotals = new Map<string, number>();
    for (const client of clients) cityTotals.set(client.city.trim() || t('cvNoCity'), (cityTotals.get(client.city.trim() || t('cvNoCity')) ?? 0) + 1);
    return {
      active: clients.filter((client) => client.is_active).length,
      withAccount: clients.filter((client) => accountOf(client) === 'active').length,
      invited: clients.filter((client) => accountOf(client) === 'invited').length,
      invoiced: total((m) => m.invoicedMad),
      outstanding: total((m) => m.outstandingMad),
      overdue: total((m) => m.overdueMad),
      openOrders: total((m) => m.openOrders),
      top: [...withMetrics].filter((client) => client.metrics!.invoicedMad > 0).sort((a, b) => b.metrics!.invoicedMad - a.metrics!.invoicedMad).slice(0, 5)
        .map((client) => ({ label: client.name, value: client.metrics!.invoicedMad, display: money(client.metrics!.invoicedMad) })),
      cities: [...cityTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value, display: String(value) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, locale]);

  const hasMetrics = clients.some((client) => client.metrics);
  const filtersActive = search !== '' || status !== ALL || account !== ALL || balance !== ALL || city !== ALL || sort !== 'name';
  const resetFilters = () => { setSearch(''); setStatus(ALL); setAccount(ALL); setBalance(ALL); setCity(ALL); setSort('name'); };

  const columns = useMemo(() => {
    const groups = new Map<string, { label: string; clients: ViewClient[] }>();
    const add = (id: string, label: string, client: ViewClient) => {
      const group = groups.get(id) ?? { label, clients: [] };
      group.clients.push(client);
      groups.set(id, group);
    };
    if (groupBy === 'balance') BALANCE_ORDER.forEach((id) => groups.set(id, { label: t(BALANCE_KEYS[id]), clients: [] }));
    if (groupBy === 'account') ACCOUNT_ORDER.forEach((id) => groups.set(id, { label: t(ACCOUNT_KEYS[id]), clients: [] }));
    if (groupBy === 'status') { groups.set('active', { label: t('cvActive'), clients: [] }); groups.set('inactive', { label: t('cvInactive'), clients: [] }); }
    for (const client of filtered) {
      if (groupBy === 'balance') add(balanceOf(client), '', client);
      else if (groupBy === 'account') add(accountOf(client), '', client);
      else if (groupBy === 'status') add(client.is_active ? 'active' : 'inactive', '', client);
      else add(client.city.trim() || '\u0000', client.city.trim() || t('cvNoCity'), client);
    }
    return [...groups.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, groupBy, locale]);

  const timeline = useMemo(() => {
    const groups = new Map<string, { label: string; clients: ViewClient[] }>();
    const sorted = [...filtered].sort((a, b) => (b.metrics?.lastOrderAt ?? '').localeCompare(a.metrics?.lastOrderAt ?? ''));
    for (const client of sorted) {
      const last = client.metrics?.lastOrderAt;
      const id = last ? last.slice(0, 7) : 'none';
      const label = last ? new Date(last).toLocaleDateString(locale === 'ar' ? 'ar-MA' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Casablanca' }) : t('cvNoOrders');
      const group = groups.get(id) ?? { label, clients: [] };
      group.clients.push(client);
      groups.set(id, group);
    }
    return [...groups.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, locale]);

  const numbers = (client: ViewClient) => client.metrics && (
    <div className="grid grid-cols-3 gap-2 text-caption text-subtle">
      <span>{t('acctInvoiced')}<strong className="block text-xs text-foreground">{money(client.metrics.invoicedMad)}</strong></span>
      <span>{t('acctOutstanding')}<strong className={`block text-xs ${client.metrics.overdueMad > 0 ? 'text-destructive' : 'text-foreground'}`}>{money(client.metrics.outstandingMad)}</strong></span>
      <span>{t('cvLastOrder')}<strong className="block text-xs text-foreground">{dateLabel(client.metrics.lastOrderAt)}</strong></span>
    </div>
  );

  const clientCard = (client: ViewClient, compact = false) => (
    <Card key={client.id} className={`grid gap-2 p-3 ${client.is_active ? '' : 'opacity-75'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={clientPath(client.id)} className="block truncate text-sm font-bold text-foreground no-underline hover:text-primary hover:underline">{client.name}</Link>
          <small className="block truncate text-caption text-subtle">{[client.city, client.contact_name].filter(Boolean).join(' · ') || client.code}</small>
        </div>
        <ClientActions client={client} handlers={handlers} />
      </div>
      <ClientBadges client={client} />
      {!compact && numbers(client)}
      {client.metrics && compact && <div className="flex justify-between text-caption text-subtle"><span>{money(client.metrics.outstandingMad)}</span><span>{client.metrics.openOrders} {t('cvOpenOrders')}</span></div>}
    </Card>
  );

  return (
    <div className="grid gap-4">
      {hasMetrics && (
        <>
          <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-3 min-[1200px]:grid-cols-6">
            <Stat label={t('cvTotalClients')} value={clients.length} hint={`${analytics.active} ${t('cvActive')}`} />
            <Stat label={t('cvPortalAccounts')} value={analytics.withAccount} hint={`${analytics.invited} ${t('clientAcctInvited')}`} tone="success" />
            <Stat label={t('cvTotalInvoiced')} value={money(analytics.invoiced)} />
            <Stat label={t('acctOutstanding')} value={money(analytics.outstanding)} tone={analytics.outstanding > 0 ? 'warning' : undefined} />
            <Stat label={t('acctOverdue')} value={money(analytics.overdue)} tone={analytics.overdue > 0 ? 'destructive' : undefined} />
            <Stat label={t('cvOpenOrders')} value={analytics.openOrders} />
          </div>
          <div className="grid gap-3 min-[900px]:grid-cols-2">
            <BarList title={t('cvTopClients')} rows={analytics.top} />
            <BarList title={t('cvTopCities')} rows={analytics.cities} />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input className="h-9 ps-9 text-xs" type="search" aria-label={t('cvSearch')} placeholder={t('cvSearch')} value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <FilterSelect label={t('status')} value={status} onChange={setStatus}>
          <SelectItem value={ALL}>{t('status')}: {t('cvAll')}</SelectItem>
          <SelectItem value="active">{t('cvActive')}</SelectItem>
          <SelectItem value="inactive">{t('cvInactive')}</SelectItem>
        </FilterSelect>
        {hasMetrics && (
          <>
            <FilterSelect label={t('clientAccountStatus')} value={account} onChange={setAccount}>
              <SelectItem value={ALL}>{t('clientAccountStatus')}: {t('cvAll')}</SelectItem>
              {ACCOUNT_ORDER.map((id) => <SelectItem key={id} value={id}>{t(ACCOUNT_KEYS[id])}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label={t('cvFilterBalance')} value={balance} onChange={setBalance}>
              <SelectItem value={ALL}>{t('cvFilterBalance')}: {t('cvAll')}</SelectItem>
              {BALANCE_ORDER.map((id) => <SelectItem key={id} value={id}>{t(BALANCE_KEYS[id])}</SelectItem>)}
            </FilterSelect>
          </>
        )}
        {cities.length > 0 && (
          <FilterSelect label={t('city')} value={city} onChange={setCity}>
            <SelectItem value={ALL}>{t('city')}: {t('cvAll')}</SelectItem>
            {cities.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </FilterSelect>
        )}
        <FilterSelect label={t('cvSort')} value={sort} onChange={setSort}>
          <SelectItem value="name">{t('cvSortName')}</SelectItem>
          {hasMetrics && <SelectItem value="outstanding">{t('cvSortOutstanding')}</SelectItem>}
          {hasMetrics && <SelectItem value="revenue">{t('cvSortRevenue')}</SelectItem>}
          {hasMetrics && <SelectItem value="recent">{t('cvSortRecent')}</SelectItem>}
          {hasMetrics && <SelectItem value="orders">{t('cvSortOrders')}</SelectItem>}
        </FilterSelect>
        {view === 'board' && (
          <FilterSelect label={t('cvGroupBy')} value={groupBy} onChange={(value) => setGroupBy(value as GroupBy)}>
            <SelectItem value="balance">{t('cvGroupBy')}: {t('cvFilterBalance')}</SelectItem>
            <SelectItem value="account">{t('cvGroupBy')}: {t('clientAccountStatus')}</SelectItem>
            <SelectItem value="status">{t('cvGroupBy')}: {t('status')}</SelectItem>
            <SelectItem value="city">{t('cvGroupBy')}: {t('city')}</SelectItem>
          </FilterSelect>
        )}
        {filtersActive && <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>{t('cvReset')}</Button>}
        <div className="ms-auto flex rounded-md border border-border p-0.5" role="group" aria-label={t('cvViews')}>
          {VIEWS.map((entry) => {
            const Icon = entry.icon;
            return (
              <Button key={entry.id} type="button" variant={view === entry.id ? 'secondary' : 'ghost'} size="icon" className="size-8" aria-pressed={view === entry.id} title={t(entry.key)} aria-label={t(entry.key)} onClick={() => chooseView(entry.id)}><Icon size={16} /></Button>
            );
          })}
        </div>
      </div>
      <p className="m-0 text-caption text-subtle" role="status">{filtered.length} / {clients.length} {t('cvResults')}</p>

      {filtered.length === 0 && <p className="m-0 grid min-h-[110px] place-items-center text-sm text-subtle">{t('cvEmpty')}</p>}

      {filtered.length > 0 && view === 'list' && (
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-max border-collapse text-start text-xs">
            <thead>
              <tr className="bg-surface text-subtle [&>th]:h-10 [&>th]:px-3 [&>th]:text-start [&>th]:font-semibold [&>th]:whitespace-nowrap">
                <th>{t('customerOrStore')}</th><th>{t('contact')}</th><th>{t('city')}</th>
                {hasMetrics && <><th>{t('acctInvoiced')}</th><th>{t('acctOutstanding')}</th><th>{t('cvOrdersCount')}</th><th>{t('cvLastOrder')}</th></>}
                <th>{t('status')}</th>
                {canManage && <th className="text-end"><span className="sr-only">{t('actions')}</span></th>}
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-divider [&>tr>td]:px-3 [&>tr>td]:py-2.5 hover:[&>tr]:bg-surface">
              {filtered.map((client) => (
                <tr key={client.id} className={client.is_active ? '' : 'opacity-70'}>
                  <td><Link href={clientPath(client.id)} className="font-bold text-foreground no-underline hover:text-primary hover:underline">{client.name}</Link><small className="block text-caption text-subtle">{client.code}</small></td>
                  <td>{client.contact_name || '—'}<small className="block text-caption text-subtle" dir="ltr">{client.phone}</small></td>
                  <td>{client.city || '—'}</td>
                  {hasMetrics && <>
                    <td>{client.metrics ? money(client.metrics.invoicedMad) : '—'}</td>
                    <td className={client.metrics && client.metrics.overdueMad > 0 ? 'text-destructive' : ''}>{client.metrics ? money(client.metrics.outstandingMad) : '—'}</td>
                    <td>{client.metrics ? `${client.metrics.orderCount}${client.metrics.openOrders ? ` (${client.metrics.openOrders} ${t('cvOpenOrders')})` : ''}` : '—'}</td>
                    <td>{dateLabel(client.metrics?.lastOrderAt)}</td>
                  </>}
                  <td><ClientBadges client={client} /></td>
                  {canManage && <td><ClientActions client={client} handlers={handlers} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && view === 'grid' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">{filtered.map((client) => clientCard(client))}</div>
      )}

      {filtered.length > 0 && view === 'board' && (
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {columns.map((column) => (
            <section key={column.label} className="grid w-[280px] shrink-0 gap-2 rounded-md border border-border bg-surface p-2">
              <h3 className="m-0 flex items-center justify-between px-1 text-xs font-bold text-foreground">{column.label}<Badge variant="secondary">{column.clients.length}</Badge></h3>
              {column.clients.length === 0 ? <p className="m-0 px-1 py-3 text-caption text-subtle">—</p> : column.clients.map((client) => clientCard(client, true))}
            </section>
          ))}
        </div>
      )}

      {filtered.length > 0 && view === 'timeline' && (
        <div className="grid gap-5">
          {timeline.map((group) => (
            <section key={group.label} className="grid gap-2 border-s-2 border-border ps-4">
              <h3 className="m-0 text-xs font-bold text-foreground">{group.label} <span className="font-normal text-subtle">· {group.clients.length}</span></h3>
              <div className="grid gap-2 min-[900px]:grid-cols-2">
                {group.clients.map((client) => (
                  <Card key={client.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <Link href={clientPath(client.id)} className="block truncate text-sm font-bold text-foreground no-underline hover:text-primary hover:underline">{client.name}</Link>
                      <small className="text-caption text-subtle">{t('cvLastOrder')}: {dateLabel(client.metrics?.lastOrderAt)} · {client.metrics?.orderCount ?? 0} {t('cvOrdersCount')}</small>
                    </div>
                    <ClientBadges client={client} />
                    <ClientActions client={client} handlers={handlers} />
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
