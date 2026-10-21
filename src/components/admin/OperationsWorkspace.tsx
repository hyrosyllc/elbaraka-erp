'use client';

import { FormEvent, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, CircleAlert, FilePlus2, PackageCheck, Plus, Truck, X } from 'lucide-react';
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
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="editor-dialog order-dialog" role="dialog" aria-modal="true" aria-labelledby="order-editor-title">
        <div className="dialog-heading"><div><p className="section-kicker">{t('sales')}</p><h2 id="order-editor-title">{t('newOrder')}</h2></div><button className="icon-button" type="button" aria-label={t('close')} onClick={onClose}><X size={19} /></button></div>
        <form onSubmit={handleSubmit}>
          <div className="editor-body">
            <label className="field"><span>{t('customerOrStore')}</span><span className="select-wrap"><select autoFocus value={clientId} onChange={(event) => setClientId(event.target.value)} required><option value="">{t('selectClient')}</option>{clients.filter((client) => client.active).map((client) => <option key={client.id} value={client.id}>{client.name} · {client.city}</option>)}</select><ChevronDown size={15} /></span></label>
            <div className="order-lines-heading"><div><strong>{t('finishedGoods')}</strong><small>{t('orderOnlyActiveSkus')}</small></div><button type="button" className="small-action" onClick={() => setLines((current) => [...current, { itemId: '', quantity: '1' }])}><Plus size={15} /> {t('addLine')}</button></div>
            <div className="order-line-list">
              {lines.map((line, index) => {
                const item = sellableItems.find((candidate) => candidate.id === line.itemId);
                const available = item ? item.stockOnHand - getReserved(orders, item.id) : 0;
                return (
                  <div className="order-line-editor" key={`order-line-${index}`}>
                    <span className="select-wrap"><select aria-label={`${t('finishedGood')} ${index + 1}`} value={line.itemId} onChange={(event) => setLine(index, { itemId: event.target.value })} required><option value="">{t('selectFinishedGood')}</option>{sellableItems.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku}</option>)}</select><ChevronDown size={15} /></span>
                    <label className="quantity-field"><span className="sr-only">{t('quantity')}</span><input type="number" min="1" step="1" inputMode="numeric" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} required /></label>
                    <span className="line-availability">{item ? `${available} ${t('availableStock')}` : t('chooseItem')}</span>
                    <button className="icon-button" type="button" aria-label={`${t('removeLine')} ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}><X size={16} /></button>
                  </div>
                );
              })}
            </div>
            {sellableItems.length === 0 && <p className="stock-hint"><CircleAlert size={15} /> {t('addFinishedGoodsFirst')}</p>}
            {clients.filter((client) => client.active).length === 0 && <p className="stock-hint"><CircleAlert size={15} /> {t('addClient')}</p>}
            <p className="stock-hint"><PackageCheck size={15} /> {t('reservationDispatchNote')}</p>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>{t('cancel')}</button><button className="button button-primary" type="submit"><Check size={16} /> {t('confirm')}</button></div>
        </form>
      </section>
    </div>
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
            {order.status === 'confirmed' ? <button className="button button-secondary" onClick={() => onCreateDelivery(order.id)}><Truck size={16} /> {t('markDelivered')}</button> : <span className="done-indicator"><Check size={16} />{t('delivered')}</span>}
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
          <button className="button button-primary" onClick={() => setShowOrderComposer(true)}><Plus size={17} /> {t('newOrder')}</button>
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
          <div className="dispatch-callout"><div className="dispatch-callout-icon"><Truck size={17} /></div><p><strong>{awaitingDispatch.length} {t('awaitingDispatch')}</strong><span>{t('createDeliveryFromOrder')}</span></p><button className="text-action" onClick={() => onNavigate('orders')}>{t('navOrders')}</button></div>
        )}
        <DeliveryList deliveryNotes={data.deliveryNotes} />
      </section>
    </>
  );
}