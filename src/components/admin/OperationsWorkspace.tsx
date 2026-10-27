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
      <DialogContent className="editor-dialog order-dialog" showCloseButton={false}>
        <DialogHeader className="dialog-heading flex-row items-center justify-between"><div><p className="section-kicker">{t('sales')}</p><DialogTitle id="order-editor-title">{t('newOrder')}</DialogTitle><DialogDescription className="sr-only">{t('orderOnlyActiveSkus')}</DialogDescription></div><Button variant="ghost" size="icon" className="icon-button" type="button" aria-label={t('close')} onClick={onClose}><X size={19} /></Button></DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="editor-body">
            <Label className="field"><span>{t('customerOrStore')}</span><Select value={clientId || 'unselected'} onValueChange={(value) => setClientId(value === 'unselected' ? '' : value)}><SelectTrigger autoFocus><SelectValue placeholder={t('selectClient')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectClient')}</SelectItem>{clients.filter((client) => client.active).map((client) => <SelectItem key={client.id} value={client.id}>{client.name} · {client.city}</SelectItem>)}</SelectContent></Select></Label>
            <div className="order-lines-heading"><div><strong>{t('finishedGoods')}</strong><small>{t('orderOnlyActiveSkus')}</small></div><Button type="button" className="small-action" onClick={() => setLines((current) => [...current, { itemId: '', quantity: '1' }])}><Plus size={15} /> {t('addLine')}</Button></div>
            <div className="order-line-list">
              {lines.map((line, index) => {
                const item = sellableItems.find((candidate) => candidate.id === line.itemId);
                const available = item ? item.stockOnHand - getReserved(orders, item.id) : 0;
                return (
                  <div className="order-line-editor" key={`order-line-${index}`}>
                    <Select value={line.itemId || 'unselected'} onValueChange={(value) => setLine(index, { itemId: value === 'unselected' ? '' : value })}><SelectTrigger aria-label={`${t('finishedGood')} ${index + 1}`}><SelectValue placeholder={t('selectFinishedGood')} /></SelectTrigger><SelectContent><SelectItem value="unselected">{t('selectFinishedGood')}</SelectItem>{sellableItems.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku}</SelectItem>)}</SelectContent></Select>
                    <Label className="quantity-field"><span className="sr-only">{t('quantity')}</span><Input type="number" min="1" step="1" inputMode="numeric" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} required /></Label>
                    <span className="line-availability">{item ? `${available} ${t('availableStock')}` : t('chooseItem')}</span>
                    <Button className="icon-button" type="button" aria-label={`${t('removeLine')} ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}><X size={16} /></Button>
                  </div>
                );
              })}
            </div>
            {sellableItems.length === 0 && <p className="stock-hint"><CircleAlert size={15} /> {t('addFinishedGoodsFirst')}</p>}
            {clients.filter((client) => client.active).length === 0 && <p className="stock-hint"><CircleAlert size={15} /> {t('addClient')}</p>}
            <p className="stock-hint"><PackageCheck size={15} /> {t('reservationDispatchNote')}</p>
            {error && <p className="form-error" role="alert">{error}</p>}
          </DialogBody>
          <DialogFooter className="dialog-actions"><Button variant="secondary" className="button button-secondary" type="button" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" className="button button-primary" type="submit"><Check size={16} /> {t('confirm')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrderList({ orders, onCreateDelivery }: { orders: SalesOrder[]; onCreateDelivery: (orderId: string) => void }) {
  const { t, locale } = useLocale();
  if (orders.length === 0) {
    return <div className="empty-state"><div className="empty-state-icon"><FilePlus2 size={21} /></div><strong>{t('noOrders')}</strong><p>{t('emptyHint')}</p></div>;
  }

  return (
    <div className="operations-list">
      {orders.map((order) => (
        <article className="operation-record" key={order.id}>
          <div className="operation-record-main">
            <div className="operation-record-title"><strong>{order.number}</strong><span className={`status ${order.status === 'confirmed' ? 'status-warning' : 'status-ready'}`}>{t(order.status === 'confirmed' ? 'awaitingDispatch' : 'delivered')}</span></div>
            <h3>{order.customer}</h3>
            <p className="record-date">{dateTime(order.createdAt, locale)}</p>
          </div>
          <div className="operation-record-lines">
            {order.lines.map((line) => <div className="operation-line" key={`${order.id}-${line.itemId}`}><span>{line.name}<small>{line.sku} · {formatMad(line.unitPriceMad, locale)} × {line.quantity}</small></span><strong>{formatMad(line.quantity * line.unitPriceMad, locale)}</strong></div>)}
          </div>
          <div className="operation-record-action">
            {order.status === 'confirmed' ? <Button className="button button-secondary" onClick={() => onCreateDelivery(order.id)}><Truck size={16} /> {t('markDelivered')}</Button> : <span className="done-indicator"><Check size={16} />{t('delivered')}</span>}
          </div>
        </article>
      ))}
    </div>
  );
}

function DeliveryList({ deliveryNotes }: { deliveryNotes: DeliveryNote[] }) {
  const { t, locale } = useLocale();
  if (deliveryNotes.length === 0) {
    return <div className="empty-state"><div className="empty-state-icon"><Truck size={21} /></div><strong>{t('noDeliveries')}</strong><p>{t('emptyHint')}</p></div>;
  }

  return (
    <div className="operations-list">
      {deliveryNotes.map((note) => (
        <article className="operation-record delivery-record" key={note.id}>
          <div className="operation-record-main">
            <div className="operation-record-title"><strong>{note.number}</strong><span className="status status-ready">{t('delivered')}</span></div>
            <h3>{note.customer}</h3>
            <p className="record-date">{note.orderNumber} · {dateTime(note.createdAt, locale)}</p>
          </div>
          <div className="operation-record-lines">
            {note.lines.map((line) => <div className="operation-line" key={`${note.id}-${line.itemId}`}><span>{line.name}<small>{line.sku}</small></span><strong>{line.quantity} ea</strong></div>)}
          </div>
          <div className="delivery-total"><span>Total units</span><strong>{note.lines.reduce((total, line) => total + line.quantity, 0)}</strong></div>
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
        <section className="operations-summary surface">
          <div className="summary-icon summary-icon-gold"><ArrowDownRight size={19} /></div>
          <div><strong>{awaitingDispatch.length}</strong><span>{t('awaitingDispatch')}</span></div>
          <div className="summary-divider" />
          <div className="summary-icon summary-icon-green"><ArrowUpRight size={19} /></div>
          <div><strong>{deliveredOrders.length}</strong><span>{t('delivered')}</span></div>
          <Button className="button button-primary" onClick={() => setShowOrderComposer(true)}><Plus size={17} /> {t('newOrder')}</Button>
        </section>
        <section className="surface operations-surface">
          <div className="section-heading"><div><p className="section-kicker">{t('customerDemand')}</p><h2>{t('navOrders')}</h2></div><span className="status status-neutral">{data.orders.length} {t('totalRecords')}</span></div>
          <OrderList orders={data.orders} onCreateDelivery={onCreateDelivery} />
        </section>
        {showOrderComposer && <OrderComposer items={data.items} clients={clients} orders={data.orders} onClose={() => setShowOrderComposer(false)} onCreateOrder={onCreateOrder} />}
      </>
    );
  }

  return (
    <>
      <section className="operations-summary surface">
        <div className="summary-icon summary-icon-green"><Truck size={19} /></div>
        <div><strong>{data.deliveryNotes.length}</strong><span>{t('navDeliveries')}</span></div>
        <div className="summary-divider" />
        <div className="summary-icon summary-icon-gold"><PackageCheck size={19} /></div>
        <div><strong>{awaitingDispatch.length}</strong><span>{t('readyToDeliver')}</span></div>
        <div className="delivery-summary-note">{t('deliverySummaryNote')}</div>
      </section>
      <section className="surface operations-surface">
        <div className="section-heading"><div><p className="section-kicker">{t('dispatch')}</p><h2>{t('navDeliveries')}</h2></div><span className="status status-neutral">{data.deliveryNotes.length} {t('totalRecords')}</span></div>
        {awaitingDispatch.length > 0 && (
          <div className="dispatch-callout"><div className="dispatch-callout-icon"><Truck size={17} /></div><p><strong>{awaitingDispatch.length} {t('awaitingDispatch')}</strong><span>{t('createDeliveryFromOrder')}</span></p><Button className="text-action" onClick={() => onNavigate('orders')}>{t('navOrders')}</Button></div>
        )}
        <DeliveryList deliveryNotes={data.deliveryNotes} />
      </section>
    </>
  );
}