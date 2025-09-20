'use client';

import { useState, useEffect, useCallback, FC } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Calendar, FileText, CornerDownLeft } from 'lucide-react';
import { Invoice } from '../../../types';

// --- Main Component ---
const InvoiceDetailPage: FC = () => {
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [supabase] = useState(() => createClientComponentClient());
    
    const params = useParams();
    const id = params.id as string;

    const fetchInvoice = useCallback(async () => {
        if (!id) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('invoices')
                .select(`*, clients(*), invoice_items(*)`)
                .eq('id', id)
                .single();

            if (error) throw error;
            setInvoice(data);
        } catch (error) {
            console.error('Error fetching invoice details:', error);
            setInvoice(null);
        } finally {
            setLoading(false);
        }
    }, [supabase, id]);

    useEffect(() => {
        fetchInvoice();
    }, [fetchInvoice]);

    if (loading) {
        return <div className="text-center p-12">Loading Invoice...</div>;
    }

    if (!invoice) {
        return (
            <div className="text-center p-12">
                <h2 className="text-xl font-semibold mb-4">Invoice not found</h2>
                <Link href="/" className="text-indigo-600 hover:underline">
                    Return to Dashboard
                </Link>
            </div>
        );
    }
    
    const subtotal = invoice.invoice_items.reduce((sum, item) => sum + (item.quantity * item.price_at_sale), 0);
    const finalTotal = subtotal - (invoice.return_value || 0);

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 font-sans">
             <header className="mb-8">
                <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4">
                    <ArrowLeft size={18} /> Back to Dashboard
                </Link>
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900">Invoice</h1>
                        <p className="text-slate-500">Details for invoice #{invoice.id.substring(0, 8)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-slate-500">Final Amount</p>
                        <p className="text-4xl font-bold text-slate-800">${finalTotal.toFixed(2)}</p>
                    </div>
                </div>
            </header>

            {/* ... other info cards ... */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-sm">
                <div className="bg-white p-4 rounded-lg shadow-sm flex items-center gap-4">
                    <User className="text-slate-400" />
                    <div>
                        <p className="text-slate-500">Client</p>
                        <p className="font-semibold text-slate-800">{invoice.clients?.name}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm flex items-center gap-4">
                    <Calendar className="text-slate-400" />
                    <div>
                        <p className="text-slate-500">Date Issued</p>
                        <p className="font-semibold text-slate-800">{new Date(invoice.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                 <div className="bg-white p-4 rounded-lg shadow-sm flex items-center gap-4">
                    <FileText className="text-slate-400" />
                    <div>
                        <p className="text-slate-500">Status</p>
                        <p className="font-semibold text-green-600">Paid / Completed</p>
                    </div>
                </div>
            </div>


            <main className="bg-white p-6 rounded-lg shadow-sm">
                 <h2 className="text-xl font-semibold mb-4 text-slate-800">Invoice Items</h2>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                            <tr>
                                <th className="px-4 py-3">Product</th>
                                <th className="px-4 py-3 text-center">Quantity</th>
                                <th className="px-4 py-3 text-center">Unit Price</th>
                                <th className="px-4 py-3 text-right">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.invoice_items.map((item, index) => {
                                const itemSubtotal = item.quantity * item.price_at_sale;
                                return (
                                <tr key={index} className="border-b">
                                    <td className="px-4 py-4 font-medium">{item.product_name} ({item.product_size})</td>
                                    <td className="px-4 py-4 text-center">{item.quantity}</td>
                                    <td className="px-4 py-4 text-center">${item.price_at_sale.toFixed(2)}</td>
                                    <td className="px-4 py-4 text-right font-semibold">${itemSubtotal.toFixed(2)}</td>
                                </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="font-semibold">
                                <td colSpan={3} className="px-4 py-4 text-right text-slate-600">Subtotal</td>
                                <td className="px-4 py-4 text-right text-slate-800">${subtotal.toFixed(2)}</td>
                            </tr>
                            {invoice.return_value > 0 && (
                                <tr className="font-semibold text-red-600">
                                    <td colSpan={3} className="px-4 py-4 text-right">
                                        Return <span className="text-xs font-normal text-slate-500 italic">({invoice.return_comment})</span>
                                    </td>
                                    <td className="px-4 py-4 text-right">-${invoice.return_value.toFixed(2)}</td>
                                </tr>
                            )}
                            <tr className="font-bold text-xl">
                                <td colSpan={3} className="px-4 py-4 text-right">Total</td>
                                <td className="px-4 py-4 text-right">${finalTotal.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                 </div>
            </main>
        </div>
    );
}

export default InvoiceDetailPage;

