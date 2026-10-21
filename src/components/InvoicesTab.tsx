import { FC } from 'react';
import Link from 'next/link';
import { Invoice } from '@/types';
import { Plus } from 'lucide-react';

type InvoicesTabProps = {
    invoices: Invoice[];
};

export const InvoicesTab: FC<InvoicesTabProps> = ({ invoices }) => {
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold capitalize">Invoices</h2>
                 <Link href="/invoices/new">
                    <span className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700">
                        <Plus size={20}/> New Invoice
                    </span>
                </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {invoices.map(invoice => {
                    const totalAmount = invoice.invoice_items.reduce((sum, item) => sum + (item.quantity * item.price_at_sale), 0);
                    const returnValue = invoice.return_value ?? 0;
                    const finalAmount = totalAmount - returnValue;
                    return (
                        <Link href={`/invoices/${invoice.id}`} key={invoice.id}>
                            <div className="bg-white rounded-xl shadow-sm p-4 border hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold">{invoice.clients?.name || 'Unknown Client'}</h3>
                                        <p className="text-xs text-slate-500">{new Date(invoice.created_at).toLocaleString()}</p>
                                    </div>
                                    <span className="font-bold text-lg text-slate-800">${finalAmount.toFixed(2)}</span>
                                </div>
                                <ul className="text-sm mt-3 space-y-1">
                                    {invoice.invoice_items.map((item, index) => (
                                    <li key={index} className="flex justify-between">
                                        <span>{`${item.product_name} (${item.product_size})`}</span>
                                        <span className="text-slate-500">{item.quantity} x ${item.price_at_sale.toFixed(2)}</span>
                                    </li>
                                    ))}
                                </ul>
                                {returnValue > 0 && (
                                     <div className="text-sm mt-2 pt-2 border-t text-red-600 flex justify-between">
                                        <span>Return</span>
                                    <span>-${returnValue.toFixed(2)}</span>
                                     </div>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

