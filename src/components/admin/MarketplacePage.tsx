'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { MarginRow, MaterialRow } from '@/lib/api/marketplace';
import { formatMad } from '@/lib/workspace';
import { useLocale } from './LocaleContext';

type Supplier = { id: string; name: string };
type Realized = { revenueMad: number; creditsMad: number; netRevenueMad: number; costMad: number; profitMad: number };
type Payload = { materials: MaterialRow[]; suppliers: Supplier[]; margins?: MarginRow[]; realized?: Realized };
type Point = { at: string; price: number; supplierId: string | null; source: string };
type View = 'prices' | 'margins';

const RANGES = [{ id: '7d', days: 7 }, { id: '30d', days: 30 }, { id: '90d', days: 90 }, { id: '1y', days: 365 }] as const;

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-subtle">–</span>;
  const tone = value > 0 ? 'text-danger' : value < 0 ? 'text-success' : 'text-subtle';
  return <span className={`font-medium tabular-nums ${tone}`}>{value > 0 ? '▲' : value < 0 ? '▼' : ''} {Math.abs(value).toFixed(2)}%</span>;
}

function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="text-subtle">–</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - 2 - ((value - min) / span) * (height - 4)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" className={up ? 'stroke-danger' : 'stroke-success'} />
    </svg>
  );
}

function PriceChart({ points }: { points: Point[] }) {
  const width = 720;
  const height = 240;
  if (points.length < 2) return <p className="m-0 py-10 text-center text-sm text-subtle">–</p>;
  const times = points.map((point) => Date.parse(point.at));
  const prices = points.map((point) => point.price);
  const t0 = times[0];
  const t1 = times[times.length - 1] || t0 + 1;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min || max || 1) * 0.1;
  const lo = min - pad;
  const hi = max + pad;
  const x = (time: number) => 8 + ((time - t0) / (t1 - t0 || 1)) * (width - 70);
  const y = (price: number) => 8 + (1 - (price - lo) / (hi - lo)) * (height - 24);
  const line = points.map((point, index) => `${x(times[index]).toFixed(1)},${y(point.price).toFixed(1)}`).join(' ');
  const area = `${x(t0)},${height - 16} ${line} ${x(t1)},${height - 16}`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((fraction) => lo + (hi - lo) * fraction);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Price chart">
      {grid.map((value) => (
        <g key={value}>
          <line x1="8" x2={width - 62} y1={y(value)} y2={y(value)} className="stroke-border" strokeDasharray="3 4" />
          <text x={width - 56} y={y(value) + 4} className="fill-subtle text-[10px]">{value.toFixed(2)}</text>
        </g>
      ))}
      <polygon points={area} className="fill-primary/10" />
      <polyline points={line} fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-primary" />
      {points.map((point, index) => <circle key={`${point.at}-${index}`} cx={x(times[index])} cy={y(point.price)} r={point.source === 'purchase' ? 3.5 : 2.5} className={point.source === 'purchase' ? 'fill-warning' : 'fill-primary'} />)}
    </svg>
  );
}

export function MarketplacePage({ isManager }: { isManager: boolean }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('prices');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30d');
  const [supplierId, setSupplierId] = useState('none');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/marketplace', { cache: 'no-store' });
      const result = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(result.error ?? t('mkLoadFailed'));
      setData(result);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('mkLoadFailed'));
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const loadHistory = useCallback(async (itemId: string) => {
    const response = await fetch(`/api/operations/marketplace?itemId=${itemId}`, { cache: 'no-store' });
    if (response.ok) setHistory(((await response.json()) as { history: Point[] }).history);
  }, []);

  useEffect(() => { if (selectedId) void loadHistory(selectedId); }, [selectedId, loadHistory]);

  const selected = data?.materials.find((row) => row.id === selectedId) ?? null;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.materials ?? []).filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.sku.toLowerCase().includes(needle));
  }, [data, query]);

  const chartPoints = useMemo(() => {
    const days = RANGES.find((entry) => entry.id === range)?.days ?? 30;
    const since = Date.now() - days * 86_400_000;
    return history.filter((point) => Date.parse(point.at) >= since);
  }, [history, range]);

  const supplierName = (id: string | null) => data?.suppliers.find((supplier) => supplier.id === id)?.name ?? t('mkMarket');
  const fmt = (value: number | null) => (value === null ? '–' : value.toLocaleString(locale === 'ar' ? 'ar-MA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  async function submitPrice() {
    if (!selected) return;
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) { setNotice(t('mkInvalidPrice')); return; }
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/operations/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'price', itemId: selected.id, supplierId: supplierId === 'none' ? null : supplierId, price: value, note, idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t('mkSaveFailed'));
      setPrice('');
      setNote('');
      setNotice(t('mkSaved'));
      await Promise.all([load(), loadHistory(selected.id)]);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : t('mkSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-danger" role="alert">{error}</p>;
  if (!data) return <p className="text-sm text-subtle" role="status">{t('mkLoading')}</p>;

  if (selected) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { setSelectedId(null); setHistory([]); setNotice(''); }}>← {t('mkBack')}</Button>
          <h2 className="m-0 text-lg font-semibold">{selected.name} <span className="text-sm font-normal text-subtle">{selected.sku}</span></h2>
        </div>
        <Card className="grid gap-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="m-0 text-3xl font-semibold tabular-nums">{selected.price === null ? '–' : formatMad(selected.price)} <span className="text-sm font-normal text-subtle">/ {selected.unit === 'kg' ? t('mkPerKg') : t('mkPerUnit')}</span></p>
              <p className="m-0 mt-1 flex gap-3 text-sm">24h <Change value={selected.change24h} /> 7d <Change value={selected.change7d} /> 30d <Change value={selected.change30d} /></p>
            </div>
            <div className="flex gap-1" role="tablist">
              {RANGES.map((entry) => <Button key={entry.id} size="sm" variant={range === entry.id ? 'primary' : 'outline'} onClick={() => setRange(entry.id)}>{entry.id.toUpperCase()}</Button>)}
            </div>
          </div>
          <PriceChart points={chartPoints} />
          <dl className="m-0 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[[t('mkHigh30'), selected.high30], [t('mkLow30'), selected.low30], [t('mkAvg30'), selected.avg30], [t('mkBest'), selected.bestPrice]].map(([label, value]) => (
              <div key={String(label)}><dt className="text-xs text-subtle">{label}</dt><dd className="m-0 font-medium tabular-nums">{fmt(value as number | null)}</dd></div>
            ))}
          </dl>
        </Card>
        <Card className="p-4">
          <h3 className="m-0 mb-3 text-sm font-semibold">{t('mkSupplierQuotes')}</h3>
          {selected.suppliers.length === 0 ? <p className="m-0 text-sm text-subtle">{t('mkNoQuotes')}</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>{t('mkSupplier')}</TableHead><TableHead>{t('mkPrice')}</TableHead><TableHead>{t('mkVsBest')}</TableHead><TableHead>{t('mkSource')}</TableHead><TableHead>{t('mkUpdated')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {selected.suppliers.map((quote) => (
                  <TableRow key={quote.supplierId ?? 'market'}>
                    <TableCell>{quote.name}{quote.supplierId === selected.bestSupplierId && <Badge variant="success" className="ms-2">{t('mkBest')}</Badge>}</TableCell>
                    <TableCell className="tabular-nums">{fmt(quote.price)}</TableCell>
                    <TableCell><Change value={quote.deltaToBest} /></TableCell>
                    <TableCell><Badge variant="secondary">{quote.source === 'purchase' ? t('mkSourcePurchase') : t('mkSourceManual')}</Badge></TableCell>
                    <TableCell className="text-xs text-subtle">{new Date(quote.at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card className="grid gap-3 p-4">
          <h3 className="m-0 text-sm font-semibold">{t('mkUpdatePrice')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>{t('mkSupplier')}</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('mkMarket')}</SelectItem>
                  {data.suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mk-price">{t('mkPrice')} ({selected.unit === 'kg' ? t('mkPerKg') : t('mkPerUnit')})</Label>
              <Input id="mk-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mk-note">{t('mkNote')}</Label>
              <Input id="mk-note" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={submitPrice} disabled={busy}>{t('mkSavePrice')}</Button>
            {notice && <span className="text-sm text-subtle" role="status">{notice}</span>}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {isManager && data.realized && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[[t('mkRevenue30'), formatMad(data.realized.revenueMad)], [t('mkCredits30'), formatMad(data.realized.creditsMad)], [t('mkCost30'), formatMad(data.realized.costMad)], [t('mkProfit30'), `${formatMad(data.realized.profitMad)}${data.realized.netRevenueMad > 0 ? ` · ${Math.round((data.realized.profitMad / data.realized.netRevenueMad) * 1000) / 10}%` : ''}`]].map(([label, value]) => (
            <Card key={label} className="p-4"><p className="m-0 text-xs text-subtle">{label}</p><p className="m-0 mt-1 text-lg font-semibold tabular-nums">{value}</p></Card>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={view === 'prices' ? 'primary' : 'outline'} onClick={() => setView('prices')}>{t('mkTabPrices')}</Button>
        {isManager && <Button size="sm" variant={view === 'margins' ? 'primary' : 'outline'} onClick={() => setView('margins')}>{t('mkTabMargins')}</Button>}
        {view === 'prices' && <Input className="ms-auto max-w-xs" placeholder={t('mkSearch')} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('mkSearch')} />}
      </div>
      {view === 'prices' ? (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>{t('mkMaterial')}</TableHead><TableHead>{t('mkPrice')}</TableHead><TableHead>24h</TableHead><TableHead>7d</TableHead><TableHead>30d</TableHead><TableHead>{t('mkTrend')}</TableHead><TableHead>{t('mkBest')}</TableHead><TableHead>{t('mkSuppliers')}</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-subtle">{t('mkEmpty')}</TableCell></TableRow>}
              {rows.map((row, index) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedId(row.id)}>
                  <TableCell className="text-subtle">{index + 1}</TableCell>
                  <TableCell><button type="button" className="text-start font-medium hover:underline" onClick={() => setSelectedId(row.id)}>{row.name}</button><div className="text-xs text-subtle">{row.sku}</div></TableCell>
                  <TableCell className="tabular-nums">{row.price === null ? <span className="text-warning">{t('mkNoPrice')}</span> : <>{fmt(row.price)} <span className="text-xs text-subtle">/{row.unit === 'kg' ? 'kg' : '#'}</span></>}</TableCell>
                  <TableCell><Change value={row.change24h} /></TableCell>
                  <TableCell><Change value={row.change7d} /></TableCell>
                  <TableCell><Change value={row.change30d} /></TableCell>
                  <TableCell><Sparkline values={row.spark} /></TableCell>
                  <TableCell className="text-sm">{row.bestSupplierId ? `${supplierName(row.bestSupplierId)} · ${fmt(row.bestPrice)}` : '–'}</TableCell>
                  <TableCell className="tabular-nums">{row.suppliers.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>{t('mkProduct')}</TableHead><TableHead>{t('mkSellPrice')}</TableHead><TableHead>{t('mkCost')}</TableHead><TableHead>{t('mkMargin')}</TableHead><TableHead>%</TableHead><TableHead>{t('mkMissing')}</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data.margins ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-subtle">{t('mkEmpty')}</TableCell></TableRow>}
              {(data.margins ?? []).map((row) => (
                <TableRow key={row.sizeId}>
                  <TableCell><div className="font-medium">{row.name}</div><div className="text-xs text-subtle">{row.sku}</div></TableCell>
                  <TableCell className="tabular-nums">{formatMad(row.priceMad)}</TableCell>
                  <TableCell className="tabular-nums">{row.costMad === null ? '–' : formatMad(row.costMad)}</TableCell>
                  <TableCell className={`tabular-nums ${row.marginMad !== null && row.marginMad < 0 ? 'text-danger' : ''}`}>{row.marginMad === null ? '–' : formatMad(row.marginMad)}</TableCell>
                  <TableCell className="tabular-nums">{row.marginPct === null ? '–' : `${row.marginPct}%`}</TableCell>
                  <TableCell>{row.missing.length > 0 ? <Badge variant="warning">{row.missing.map((item) => item.sku).join(', ')}</Badge> : '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
