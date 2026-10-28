'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { FormEvent, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, CircleAlert, FilePlus2, PackageCheck, Plus, Truck, X } from 'lucide-react';
import {
  CatalogItem,
  ClientAccount,
  DeliveryNote,
  SalesOrder,
  WorkspacePage,
  WorkspaceData,
  formatMad,
} from '@/lib/workspace';
import { useLocale } from './LocaleContext';

type NewOrderLine = { itemId: string; quantity: string };

function getReserved(orders: SalesOrder[], itemId: string) {
  return orders
    .filter((order) => order.status === 'confirmed')
    .flatMap((order) => order.lines)
    .filter((line) => line.itemId === itemId)
    .reduce((total, line) => total + line.quantity, 0);
}

function dateTime(iso: string, locale: 'en' | 'ar') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'en-MA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function OrderComposer({
  items,
  clients,
  orders,
  onClose,
  onCreateOrder,
}: {
  items: CatalogItem[];
  clients: ClientAccount[];
  orders: SalesOrder[];
  onClose: () => void;
  onCreateOrder: (clientId: string, lines: { itemId: string; quantity: number }[]) => void;
}) {
  const { t } = useLocale();
  const [clientId, setClientId] = useState('');
  const [lines, setLines] = useState<NewOrderLine[]>([{ itemId: '', quantity: '1' }]);
  const [error, setError] = useState('');
  const sellableItems = items.filter((item) => item.active && item.type === 'finished_good');

  const setLine = (index: number, changes: Partial<NewOrderLine>) => {
    setLines((current) => current.map((line, position) => position === index ? { ...line, ...changes } : line));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedLines = lines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) }));
    if (!clientId) {
      setError(t('selectClient'));
      return;
    }
    if (parsedLines.length === 0 || parsedLines.some((line) => !line.itemId || !Number.isInteger(line.quantity) || line.quantity < 1)) {
      setError(t('orderLineError'));
      return;
    }
    const requestedByItem = new Map<string, number>();
    for (const line of parsedLines) requestedByItem.set(line.itemId, (requestedByItem.get(line.itemId) ?? 0) + line.quantity);
    const insufficient = Array.from(requestedByItem.entries()).some(([itemId, quantity]) => {
      const item = sellableItems.find((candidate) => candidate.id === itemId);
      if (!item) return true;
      return quantity > item.stockOnHand - getReserved(orders, itemId);
    });
    if (insufficient) {
      setError(t('orderAvailabilityError'));
      return;
    }
    onCreateOrder(clientId, parsedLines);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[min(90vh,850px)] w-full max-w-[590px] overflow-y-auto rounded-[10px] border border-border bg-card shadow-xl max-[520px]:max-h-[92dvh] max-[520px]:max-w-none max-[520px]:rounded-t-xl max-[520px]:rounded-b-none max-w-[650px]" showCloseButton={false}>
        <DialogHeader className="flex items-center justify-between border-b border-border px-[22px] pb-4 pt-5 max-[520px]:px-4 max-[520px]:pb-[13px] max-[520px]:pt-4 [&_h2]:mt-[3px] [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:tracking-[-.3px] [&_h2]:text-foreground flex-row items-center justify-between"><div><p className="m-0 text-caption font-bold tracking-[.35px] text-subtle">{t('sales')}</p><DialogTitle id="order-editor-title">{t('newOrder')}</DialogTitle><DialogDescription className="sr-only">{t('orderOnlyActiveSkus')}</DialogDescription></div><Button variant="ghost" size="icon" className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-subtle transition-colors hover:border-border hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50" type="button" aria-label={t('close')} onClick={onClose}><X size={19} /></Button></DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="grid gap-[18px] px-[22px] py-5 max-[520px]:gap-[15px] max-[520px]:p-4">
            <Label className="grid min-w-0 gap-[7px] text-caption font-semibold text-muted-foreground [&>span:first-child]:min-h-[13px] [&_small]:text-micro [&_small]:font-medium [&_small]:text-subtle"><span>{t('customerOrStore')}</span><Select value={clientId || 'unselected'} onValueChange={(value) => setClientId(value === 'unselected' ? '' : value)}><SelectTrigger autoFocus><SelectValue placeholder={t('selectClient')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectClient')}</SelectItem>{clients.filter((client) => client.active).map((client) => <SelectItem key={client.id} value={client.id}>{client.name} · {client.city}</SelectItem>)}</SelectContent></Select></Label>
            <div className="mt-0.5 flex items-center justify-between gap-[10px] max-[520px]:items-start [&>div]:grid [&>div]:gap-1 [&_strong]:text-label [&_strong]:text-muted-foreground [&_small]:text-micro [&_small]:text-subtle"><div><strong>{t('finishedGoods')}</strong><small>{t('orderOnlyActiveSkus')}</small></div><Button type="button" className="inline-flex min-h-[29px] items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-border bg-card px-2 text-micro font-bold text-primary hover:bg-background" onClick={() => setLines((current) => [...current, { itemId: '', quantity: '1' }])}><Plus size={15} /> {t('addLine')}</Button></div>
            <div className="grid gap-2">
              {lines.map((line, index) => {
                const item = sellableItems.find((candidate) => candidate.id === line.itemId);
                const available = item ? item.stockOnHand - getReserved(orders, item.id) : 0;
                return (
                  <div className="grid grid-cols-[minmax(0,1fr)_62px_29px] items-center gap-[5px] min-[521px]:grid-cols-[minmax(0,1fr)_72px_minmax(68px,auto)_30px] min-[521px]:gap-[7px] [&_select]:h-[35px] [&_select]:text-caption [&_input]:h-[35px] [&_input]:text-caption" key={`order-line-${index}`}>
                    <Select value={line.itemId || 'unselected'} onValueChange={(value) => setLine(index, { itemId: value === 'unselected' ? '' : value })}><SelectTrigger aria-label={`${t('finishedGood')} ${index + 1}`}><SelectValue placeholder={t('selectFinishedGood')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectFinishedGood')}</SelectItem>{sellableItems.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku}</SelectItem>)}</SelectContent></Select>
                    <Label className="min-w-0 [&_input]:w-full"><span className="sr-only">{t('quantity')}</span><Input type="number" min="1" step="1" inputMode="numeric" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} required /></Label>
                    <span className="col-start-1 row-start-2 whitespace-nowrap text-left font-mono text-micro text-subtle min-[521px]:col-auto min-[521px]:row-auto min-[521px]:text-right">{item ? `${available} ${t('availableStock')}` : t('chooseItem')}</span>
                    <Button className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-subtle transition-colors hover:border-border hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50" type="button" aria-label={`${t('removeLine')} ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}><X size={16} /></Button>
                  </div>
                );
              })}
            </div>
            {sellableItems.length === 0 && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0"><CircleAlert size={15} /> {t('addFinishedGoodsFirst')}</p>}
            {clients.filter((client) => client.active).length === 0 && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0"><CircleAlert size={15} /> {t('addClient')}</p>}
            <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-accent-border bg-destructive-soft px-[10px] py-[9px] text-micro leading-[1.5] text-accent-foreground [&_svg]:mt-px [&_svg]:shrink-0"><PackageCheck size={15} /> {t('reservationDispatchNote')}</p>
            {error && <p className="m-0 rounded-[5px] bg-destructive-soft px-[10px] py-[9px] text-caption text-destructive" role="alert">{error}</p>}
          </DialogBody>
          <DialogFooter className="flex justify-end gap-2 border-t border-border bg-surface px-[22px] py-[14px] max-[520px]:px-4 max-[520px]:py-3 max-[520px]:pb-[max(12px,env(safe-area-inset-bottom))]"><Button variant="secondary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" type="button" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" type="submit"><Check size={16} /> {t('confirm')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrderList({ orders, onCreateDelivery }: { orders: SalesOrder[]; onCreateDelivery: (orderId: string) => void }) {
  const { t, locale } = useLocale();
  if (orders.length === 0) {
    return <div className="grid min-h-[220px] content-center justify-items-center gap-[9px] p-[25px] text-center"><div className="mb-1 grid size-[42px] place-items-center rounded-[10px] bg-muted text-subtle"><FilePlus2 size={21} /></div><strong>{t('noOrders')}</strong><p>{t('emptyHint')}</p></div>;
  }

  return (
    <div className="border-t border-border">
      {orders.map((order) => (
        <article className="grid min-h-[114px] grid-cols-1 items-center gap-3 border-b border-divider py-[15px] min-[761px]:grid-cols-[minmax(150px,.8fr)_minmax(200px,1.2fr)_auto] min-[761px]:gap-5 min-[761px]:py-[15px] min-[921px]:grid-cols-[minmax(135px,.75fr)_minmax(180px,1.25fr)] [&_.operation-record-action]:min-[921px]:col-start-3 [&_.operation-record-action]:max-[920px]:col-start-2 [&_.delivery-total]:max-[920px]:col-start-2 [&_.operation-record-action]:max-[760px]:col-auto [&_.delivery-total]:max-[760px]:col-auto" key={order.id}>
          <div className="min-w-0 [&_h3]:mb-1 [&_h3]:mt-[9px] [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-primary">
            <div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-subtle"><strong>{order.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold ${order.status === 'confirmed' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-success'}`}>{t(order.status === 'confirmed' ? 'awaitingDispatch' : 'delivered')}</span></div>
            <h3>{order.customer}</h3>
            <p className="m-0 text-micro text-subtle">{dateTime(order.createdAt, locale)}</p>
          </div>
          <div className="grid gap-[7px]">
            {order.lines.map((line) => <div className="flex items-center justify-between gap-[10px] [&>span]:grid [&>span]:gap-[3px] [&>span]:text-caption [&>span]:text-subtle [&_small]:font-mono [&_small]:text-micro [&_small]:text-subtle [&>strong]:whitespace-nowrap [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-muted-foreground" key={`${order.id}-${line.itemId}`}><span>{line.name}<small>{line.sku} · {formatMad(line.unitPriceMad, locale)} × {line.quantity}</small></span><strong>{formatMad(line.quantity * line.unitPriceMad, locale)}</strong></div>)}
          </div>
          <div className="flex justify-end max-[920px]:col-start-2 max-[760px]:col-auto [&>.button]:min-h-[34px] [&>.button]:px-[10px] [&>.button]:text-caption max-[760px]:[&>.button]:w-full">
            {order.status === 'confirmed' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-border bg-card text-muted-foreground hover:border-strong hover:bg-surface" onClick={() => onCreateDelivery(order.id)}><Truck size={16} /> {t('markDelivered')}</Button> : <span className="inline-flex items-center gap-[5px] text-caption font-semibold text-muted-foreground"><Check size={16} />{t('delivered')}</span>}
          </div>
        </article>
      ))}
    </div>
  );
}

function DeliveryList({ deliveryNotes }: { deliveryNotes: DeliveryNote[] }) {
  const { t, locale } = useLocale();
  if (deliveryNotes.length === 0) {
    return <div className="grid min-h-[220px] content-center justify-items-center gap-[9px] p-[25px] text-center"><div className="mb-1 grid size-[42px] place-items-center rounded-[10px] bg-muted text-subtle"><Truck size={21} /></div><strong>{t('noDeliveries')}</strong><p>{t('emptyHint')}</p></div>;
  }

  return (
    <div className="border-t border-border">
      {deliveryNotes.map((note) => (
        <article className="grid min-h-[114px] grid-cols-1 items-center gap-3 border-b border-divider py-[15px] min-[761px]:grid-cols-[minmax(150px,.8fr)_minmax(200px,1.2fr)_auto] min-[761px]:gap-5 min-[761px]:py-[15px] min-[921px]:grid-cols-[minmax(135px,.75fr)_minmax(180px,1.25fr)] [&_.operation-record-action]:min-[921px]:col-start-3 [&_.operation-record-action]:max-[920px]:col-start-2 [&_.delivery-total]:max-[920px]:col-start-2 [&_.operation-record-action]:max-[760px]:col-auto [&_.delivery-total]:max-[760px]:col-auto " key={note.id}>
          <div className="min-w-0 [&_h3]:mb-1 [&_h3]:mt-[9px] [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-primary">
            <div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-subtle"><strong>{note.number}</strong><span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold bg-secondary text-success">{t('delivered')}</span></div>
            <h3>{note.customer}</h3>
            <p className="m-0 text-micro text-subtle">{note.orderNumber} · {dateTime(note.createdAt, locale)}</p>
          </div>
          <div className="grid gap-[7px]">
            {note.lines.map((line) => <div className="flex items-center justify-between gap-[10px] [&>span]:grid [&>span]:gap-[3px] [&>span]:text-caption [&>span]:text-subtle [&_small]:font-mono [&_small]:text-micro [&_small]:text-subtle [&>strong]:whitespace-nowrap [&>strong]:font-mono [&>strong]:text-caption [&>strong]:font-medium [&>strong]:text-muted-foreground" key={`${note.id}-${line.itemId}`}><span>{line.name}<small>{line.sku}</small></span><strong>{line.quantity} ea</strong></div>)}
          </div>
          <div className="grid justify-items-end gap-1 text-micro text-subtle [&_strong]:font-mono [&_strong]:text-[15px] [&_strong]:font-medium [&_strong]:text-muted-foreground"><span>Total units</span><strong>{note.lines.reduce((total, line) => total + line.quantity, 0)}</strong></div>
        </article>
      ))}
    </div>
  );
}

export function OperationsWorkspace({
  page,
  data,
  clients,
  onCreateOrder,
  onCreateDelivery,
  onNavigate,
}: {
  page: Extract<WorkspacePage, 'orders' | 'deliveries'>;
  data: WorkspaceData;
  clients: ClientAccount[];
  onCreateOrder: (clientId: string, lines: { itemId: string; quantity: number }[]) => void;
  onCreateDelivery: (orderId: string) => void;
  onNavigate: (page: 'orders') => void;
}) {
  const { t } = useLocale();
  const [showOrderComposer, setShowOrderComposer] = useState(false);
  const awaitingDispatch = data.orders.filter((order) => order.status === 'confirmed');
  const deliveredOrders = data.orders.filter((order) => order.status === 'delivered');

  if (page === 'orders') {
    return (
      <>
        <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-border bg-card px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-border bg-card">
          <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-accent text-accent-foreground"><ArrowDownRight size={19} /></div>
          <div><strong>{awaitingDispatch.length}</strong><span>{t('awaitingDispatch')}</span></div>
          <div className="mx-[7px] h-[38px] w-px bg-border max-[520px]:mx-0.5" />
          <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-secondary text-success"><ArrowUpRight size={19} /></div>
          <div><strong>{deliveredOrders.length}</strong><span>{t('delivered')}</span></div>
          <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-brand-gradient text-primary-foreground hover:brightness-110" onClick={() => setShowOrderComposer(true)}><Plus size={17} /> {t('newOrder')}</Button>
        </section>
        <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
          <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-foreground [&>svg]:text-subtle"><div><p className="m-0 text-caption font-bold tracking-[.35px] text-subtle">{t('customerDemand')}</p><h2>{t('navOrders')}</h2></div><span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold bg-muted text-muted-foreground">{data.orders.length} {t('totalRecords')}</span></div>
          <OrderList orders={data.orders} onCreateDelivery={onCreateDelivery} />
        </section>
        {showOrderComposer && <OrderComposer items={data.items} clients={clients} orders={data.orders} onClose={() => setShowOrderComposer(false)} onCreateOrder={onCreateOrder} />}
      </>
    );
  }

  return (
    <>
      <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-border bg-card px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-border bg-card">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-secondary text-success"><Truck size={19} /></div>
        <div><strong>{data.deliveryNotes.length}</strong><span>{t('navDeliveries')}</span></div>
        <div className="mx-[7px] h-[38px] w-px bg-border max-[520px]:mx-0.5" />
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-accent text-accent-foreground"><PackageCheck size={19} /></div>
        <div><strong>{awaitingDispatch.length}</strong><span>{t('readyToDeliver')}</span></div>
        <div className="ml-auto max-w-[230px] text-caption leading-[1.45] text-subtle max-[760px]:mt-[3px] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:border-t max-[760px]:border-border max-[760px]:pt-2">{t('deliverySummaryNote')}</div>
      </section>
      <section className="rounded-[9px] border border-border bg-card px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
        <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-foreground [&>svg]:text-subtle"><div><p className="m-0 text-caption font-bold tracking-[.35px] text-subtle">{t('dispatch')}</p><h2>{t('navDeliveries')}</h2></div><span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-caption font-bold bg-muted text-muted-foreground">{data.deliveryNotes.length} {t('totalRecords')}</span></div>
        {awaitingDispatch.length > 0 && (
          <div className="mb-3 flex items-center gap-[10px] rounded-md border border-accent-border bg-destructive-soft px-[11px] py-[10px] max-[760px]:flex-wrap max-[760px]:items-start [&_p]:m-0 [&_p]:grid [&_p]:flex-1 [&_p]:gap-[3px] [&_strong]:text-caption [&_strong]:text-accent-foreground [&_p_span]:text-micro [&_p_span]:text-subtle [&_.text-action]:ml-auto [&_.text-action]:whitespace-nowrap max-[760px]:[&_.text-action]:ml-10"><div className="grid size-[30px] shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><Truck size={17} /></div><p><strong>{awaitingDispatch.length} {t('awaitingDispatch')}</strong><span>{t('createDeliveryFromOrder')}</span></p><Button className="min-h-0 border-0 bg-transparent px-0 py-[5px] text-label font-bold text-primary hover:bg-transparent hover:text-primary-deep hover:underline hover:underline-offset-[3px]" onClick={() => onNavigate('orders')}>{t('navOrders')}</Button></div>
        )}
        <DeliveryList deliveryNotes={data.deliveryNotes} />
      </section>
    </>
  );
}