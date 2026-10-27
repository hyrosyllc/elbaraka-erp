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
      <DialogContent className="max-h-[min(90vh,850px)] w-full max-w-[590px] overflow-y-auto rounded-[10px] border border-white/70 bg-white shadow-xl max-[520px]:max-h-[92dvh] max-[520px]:max-w-none max-[520px]:rounded-t-xl max-[520px]:rounded-b-none max-w-[650px]" showCloseButton={false}>
        <DialogHeader className="flex items-center justify-between border-b border-[#dfe5df] px-[22px] pb-4 pt-5 max-[520px]:px-4 max-[520px]:pb-[13px] max-[520px]:pt-4 [&_h2]:mt-[3px] [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:tracking-[-.3px] [&_h2]:text-[#283d32] flex-row items-center justify-between"><div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{t('sales')}</p><DialogTitle id="order-editor-title">{t('newOrder')}</DialogTitle><DialogDescription className="sr-only">{t('orderOnlyActiveSkus')}</DialogDescription></div><Button variant="ghost" size="icon" className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-[#829087] transition-colors hover:border-[#e2ece3] hover:bg-[#f0f5f0] hover:text-[#1f6041] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b2b]/50" type="button" aria-label={t('close')} onClick={onClose}><X size={19} /></Button></DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="grid gap-[18px] px-[22px] py-5 max-[520px]:gap-[15px] max-[520px]:p-4">
            <Label className="grid min-w-0 gap-[7px] text-[10px] font-semibold text-[#5c6b62] [&>span:first-child]:min-h-[13px] [&_small]:text-[9px] [&_small]:font-medium [&_small]:text-[#929d95]"><span>{t('customerOrStore')}</span><Select value={clientId || 'unselected'} onValueChange={(value) => setClientId(value === 'unselected' ? '' : value)}><SelectTrigger autoFocus><SelectValue placeholder={t('selectClient')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectClient')}</SelectItem>{clients.filter((client) => client.active).map((client) => <SelectItem key={client.id} value={client.id}>{client.name} · {client.city}</SelectItem>)}</SelectContent></Select></Label>
            <div className="mt-0.5 flex items-center justify-between gap-[10px] max-[520px]:items-start [&>div]:grid [&>div]:gap-1 [&_strong]:text-[11px] [&_strong]:text-[#42574a] [&_small]:text-[9px] [&_small]:text-[#85928a]"><div><strong>{t('finishedGoods')}</strong><small>{t('orderOnlyActiveSkus')}</small></div><Button type="button" className="inline-flex min-h-[29px] items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-[#dfe9e0] bg-white px-2 text-[9px] font-bold text-[#1f6041] hover:bg-[#f0f6f1]" onClick={() => setLines((current) => [...current, { itemId: '', quantity: '1' }])}><Plus size={15} /> {t('addLine')}</Button></div>
            <div className="grid gap-2">
              {lines.map((line, index) => {
                const item = sellableItems.find((candidate) => candidate.id === line.itemId);
                const available = item ? item.stockOnHand - getReserved(orders, item.id) : 0;
                return (
                  <div className="grid grid-cols-[minmax(0,1fr)_62px_29px] items-center gap-[5px] min-[521px]:grid-cols-[minmax(0,1fr)_72px_minmax(68px,auto)_30px] min-[521px]:gap-[7px] [&_select]:h-[35px] [&_select]:text-[10px] [&_input]:h-[35px] [&_input]:text-[10px]" key={`order-line-${index}`}>
                    <Select value={line.itemId || 'unselected'} onValueChange={(value) => setLine(index, { itemId: value === 'unselected' ? '' : value })}><SelectTrigger aria-label={`${t('finishedGood')} ${index + 1}`}><SelectValue placeholder={t('selectFinishedGood')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectFinishedGood')}</SelectItem>{sellableItems.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku}</SelectItem>)}</SelectContent></Select>
                    <Label className="min-w-0 [&_input]:w-full"><span className="sr-only">{t('quantity')}</span><Input type="number" min="1" step="1" inputMode="numeric" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} required /></Label>
                    <span className="col-start-1 row-start-2 whitespace-nowrap text-left font-mono text-[8px] text-[#7e8d83] min-[521px]:col-auto min-[521px]:row-auto min-[521px]:text-right">{item ? `${available} ${t('availableStock')}` : t('chooseItem')}</span>
                    <Button className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-transparent p-0 text-[#829087] transition-colors hover:border-[#e2ece3] hover:bg-[#f0f5f0] hover:text-[#1f6041] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b2b]/50" type="button" aria-label={`${t('removeLine')} ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}><X size={16} /></Button>
                  </div>
                );
              })}
            </div>
            {sellableItems.length === 0 && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0"><CircleAlert size={15} /> {t('addFinishedGoodsFirst')}</p>}
            {clients.filter((client) => client.active).length === 0 && <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0"><CircleAlert size={15} /> {t('addClient')}</p>}
            <p className="m-0 flex items-start gap-[7px] rounded-[5px] border border-[#f0e6cc] bg-[#faf5e8] px-[10px] py-[9px] text-[9px] leading-[1.5] text-[#7c6a3a] [&_svg]:mt-px [&_svg]:shrink-0"><PackageCheck size={15} /> {t('reservationDispatchNote')}</p>
            {error && <p className="m-0 rounded-[5px] bg-[#fbefec] px-[10px] py-[9px] text-[10px] text-[#a44737]" role="alert">{error}</p>}
          </DialogBody>
          <DialogFooter className="flex justify-end gap-2 border-t border-[#dfe5df] bg-[#fafbfa] px-[22px] py-[14px] max-[520px]:px-4 max-[520px]:py-3 max-[520px]:pb-[max(12px,env(safe-area-inset-bottom))]"><Button variant="secondary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" type="button" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" type="submit"><Check size={16} /> {t('confirm')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrderList({ orders, onCreateDelivery }: { orders: SalesOrder[]; onCreateDelivery: (orderId: string) => void }) {
  const { t, locale } = useLocale();
  if (orders.length === 0) {
    return <div className="grid min-h-[220px] content-center justify-items-center gap-[9px] p-[25px] text-center"><div className="mb-1 grid size-[42px] place-items-center rounded-[10px] bg-[#edf3ee] text-[#668171]"><FilePlus2 size={21} /></div><strong>{t('noOrders')}</strong><p>{t('emptyHint')}</p></div>;
  }

  return (
    <div className="border-t border-[#dfe5df]">
      {orders.map((order) => (
        <article className="grid min-h-[114px] grid-cols-1 items-center gap-3 border-b border-[#edf0ed] py-[15px] min-[761px]:grid-cols-[minmax(150px,.8fr)_minmax(200px,1.2fr)_auto] min-[761px]:gap-5 min-[761px]:py-[15px] min-[921px]:grid-cols-[minmax(135px,.75fr)_minmax(180px,1.25fr)] [&_.operation-record-action]:min-[921px]:col-start-3 [&_.operation-record-action]:max-[920px]:col-start-2 [&_.delivery-total]:max-[920px]:col-start-2 [&_.operation-record-action]:max-[760px]:col-auto [&_.delivery-total]:max-[760px]:col-auto" key={order.id}>
          <div className="min-w-0 [&_h3]:mb-1 [&_h3]:mt-[9px] [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#394e43]">
            <div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#738077]"><strong>{order.number}</strong><span className={`inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold ${order.status === 'confirmed' ? 'bg-[#fbf2df] text-[#8a651d]' : 'bg-[#eaf4ed] text-[#35734f]'}`}>{t(order.status === 'confirmed' ? 'awaitingDispatch' : 'delivered')}</span></div>
            <h3>{order.customer}</h3>
            <p className="m-0 text-[9px] text-[#929d95]">{dateTime(order.createdAt, locale)}</p>
          </div>
          <div className="grid gap-[7px]">
            {order.lines.map((line) => <div className="flex items-center justify-between gap-[10px] [&>span]:grid [&>span]:gap-[3px] [&>span]:text-[10px] [&>span]:text-[#69776e] [&_small]:font-mono [&_small]:text-[8px] [&_small]:text-[#9aa49d] [&>strong]:whitespace-nowrap [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#516359]" key={`${order.id}-${line.itemId}`}><span>{line.name}<small>{line.sku} · {formatMad(line.unitPriceMad, locale)} × {line.quantity}</small></span><strong>{formatMad(line.quantity * line.unitPriceMad, locale)}</strong></div>)}
          </div>
          <div className="flex justify-end max-[920px]:col-start-2 max-[760px]:col-auto [&>.button]:min-h-[34px] [&>.button]:px-[10px] [&>.button]:text-[10px] max-[760px]:[&>.button]:w-full">
            {order.status === 'confirmed' ? <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border border-[#dfe5df] bg-white text-[#4f6058] hover:border-[#b9c8bc] hover:bg-[#f7f9f7]" onClick={() => onCreateDelivery(order.id)}><Truck size={16} /> {t('markDelivered')}</Button> : <span className="inline-flex items-center gap-[5px] text-[10px] font-semibold text-[#518064]"><Check size={16} />{t('delivered')}</span>}
          </div>
        </article>
      ))}
    </div>
  );
}

function DeliveryList({ deliveryNotes }: { deliveryNotes: DeliveryNote[] }) {
  const { t, locale } = useLocale();
  if (deliveryNotes.length === 0) {
    return <div className="grid min-h-[220px] content-center justify-items-center gap-[9px] p-[25px] text-center"><div className="mb-1 grid size-[42px] place-items-center rounded-[10px] bg-[#edf3ee] text-[#668171]"><Truck size={21} /></div><strong>{t('noDeliveries')}</strong><p>{t('emptyHint')}</p></div>;
  }

  return (
    <div className="border-t border-[#dfe5df]">
      {deliveryNotes.map((note) => (
        <article className="grid min-h-[114px] grid-cols-1 items-center gap-3 border-b border-[#edf0ed] py-[15px] min-[761px]:grid-cols-[minmax(150px,.8fr)_minmax(200px,1.2fr)_auto] min-[761px]:gap-5 min-[761px]:py-[15px] min-[921px]:grid-cols-[minmax(135px,.75fr)_minmax(180px,1.25fr)] [&_.operation-record-action]:min-[921px]:col-start-3 [&_.operation-record-action]:max-[920px]:col-start-2 [&_.delivery-total]:max-[920px]:col-start-2 [&_.operation-record-action]:max-[760px]:col-auto [&_.delivery-total]:max-[760px]:col-auto " key={note.id}>
          <div className="min-w-0 [&_h3]:mb-1 [&_h3]:mt-[9px] [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#394e43]">
            <div className="flex items-center gap-2 [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#738077]"><strong>{note.number}</strong><span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold bg-[#eaf4ed] text-[#35734f]">{t('delivered')}</span></div>
            <h3>{note.customer}</h3>
            <p className="m-0 text-[9px] text-[#929d95]">{note.orderNumber} · {dateTime(note.createdAt, locale)}</p>
          </div>
          <div className="grid gap-[7px]">
            {note.lines.map((line) => <div className="flex items-center justify-between gap-[10px] [&>span]:grid [&>span]:gap-[3px] [&>span]:text-[10px] [&>span]:text-[#69776e] [&_small]:font-mono [&_small]:text-[8px] [&_small]:text-[#9aa49d] [&>strong]:whitespace-nowrap [&>strong]:font-mono [&>strong]:text-[10px] [&>strong]:font-medium [&>strong]:text-[#516359]" key={`${note.id}-${line.itemId}`}><span>{line.name}<small>{line.sku}</small></span><strong>{line.quantity} ea</strong></div>)}
          </div>
          <div className="grid justify-items-end gap-1 text-[9px] text-[#89958d] [&_strong]:font-mono [&_strong]:text-[15px] [&_strong]:font-medium [&_strong]:text-[#53665b]"><span>Total units</span><strong>{note.lines.reduce((total, line) => total + line.quantity, 0)}</strong></div>
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
        <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc]">
          <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#fbf2df] text-[#916a20]"><ArrowDownRight size={19} /></div>
          <div><strong>{awaitingDispatch.length}</strong><span>{t('awaitingDispatch')}</span></div>
          <div className="mx-[7px] h-[38px] w-px bg-[#dfe5df] max-[520px]:mx-0.5" />
          <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#eaf3eb] text-[#427250]"><ArrowUpRight size={19} /></div>
          <div><strong>{deliveredOrders.length}</strong><span>{t('delivered')}</span></div>
          <Button className="min-h-[38px] rounded-md px-3.5 py-2 text-xs font-bold transition-colors active:translate-y-px border-transparent bg-[#1f6041] text-white hover:bg-[#124b38]" onClick={() => setShowOrderComposer(true)}><Plus size={17} /> {t('newOrder')}</Button>
        </section>
        <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
          <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]"><div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{t('customerDemand')}</p><h2>{t('navOrders')}</h2></div><span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold bg-[#eff3ef] text-[#63746a]">{data.orders.length} {t('totalRecords')}</span></div>
          <OrderList orders={data.orders} onCreateDelivery={onCreateDelivery} />
        </section>
        {showOrderComposer && <OrderComposer items={data.items} clients={clients} orders={data.orders} onClose={() => setShowOrderComposer(false)} onCreateOrder={onCreateOrder} />}
      </>
    );
  }

  return (
    <>
      <section className="mb-[14px] flex min-h-[82px] items-center gap-3 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[17px] py-3 max-[760px]:flex-wrap max-[760px]:gap-2 max-[760px]:p-[11px] [&>.button]:ml-auto max-[760px]:[&>.button]:mt-[5px] max-[760px]:[&>.button]:w-full max-[760px]:[&>.button]:ml-0 rounded-[9px] border border-[#dfe5df] bg-[#fdfefc]">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#eaf3eb] text-[#427250]"><Truck size={19} /></div>
        <div><strong>{data.deliveryNotes.length}</strong><span>{t('navDeliveries')}</span></div>
        <div className="mx-[7px] h-[38px] w-px bg-[#dfe5df] max-[520px]:mx-0.5" />
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-[#fbf2df] text-[#916a20]"><PackageCheck size={19} /></div>
        <div><strong>{awaitingDispatch.length}</strong><span>{t('readyToDeliver')}</span></div>
        <div className="ml-auto max-w-[230px] text-[10px] leading-[1.45] text-[#819087] max-[760px]:mt-[3px] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:border-t max-[760px]:border-[#dfe5df] max-[760px]:pt-2">{t('deliverySummaryNote')}</div>
      </section>
      <section className="rounded-[9px] border border-[#dfe5df] bg-[#fdfefc] px-[21px] py-5 max-[760px]:px-[14px] max-[760px]:py-4">
        <div className="mb-[17px] flex items-center justify-between gap-[15px] [&_h2]:mt-[3px] [&_h2]:text-base [&_h2]:font-bold [&_h2]:tracking-[-.15px] [&_h2]:text-[#283d32] [&>svg]:text-[#7d8b82]"><div><p className="m-0 text-[10px] font-bold tracking-[.35px] text-[#88948c]">{t('dispatch')}</p><h2>{t('navDeliveries')}</h2></div><span className="inline-flex min-h-[23px] items-center justify-center whitespace-nowrap rounded-[5px] px-2 text-[10px] font-bold bg-[#eff3ef] text-[#63746a]">{data.deliveryNotes.length} {t('totalRecords')}</span></div>
        {awaitingDispatch.length > 0 && (
          <div className="mb-3 flex items-center gap-[10px] rounded-md border border-[#f0e7d2] bg-[#f8f4e8] px-[11px] py-[10px] max-[760px]:flex-wrap max-[760px]:items-start [&_p]:m-0 [&_p]:grid [&_p]:flex-1 [&_p]:gap-[3px] [&_strong]:text-[10px] [&_strong]:text-[#6c572d] [&_p_span]:text-[9px] [&_p_span]:text-[#8f7d58] [&_.text-action]:ml-auto [&_.text-action]:whitespace-nowrap max-[760px]:[&_.text-action]:ml-10"><div className="grid size-[30px] shrink-0 place-items-center rounded-md bg-[#f3e8ca] text-[#94702a]"><Truck size={17} /></div><p><strong>{awaitingDispatch.length} {t('awaitingDispatch')}</strong><span>{t('createDeliveryFromOrder')}</span></p><Button className="min-h-0 border-0 bg-transparent px-0 py-[5px] text-[11px] font-bold text-[#1f6041] hover:bg-transparent hover:text-[#124b38] hover:underline hover:underline-offset-[3px]" onClick={() => onNavigate('orders')}>{t('navOrders')}</Button></div>
        )}
        <DeliveryList deliveryNotes={data.deliveryNotes} />
      </section>
    </>
  );
}