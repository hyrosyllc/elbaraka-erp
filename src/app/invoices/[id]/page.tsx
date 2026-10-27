'use client';

import { useState, useEffect, useCallback, FC } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Calendar, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
        return <div className="p-12 text-center text-muted-foreground" role="status">Loading Invoice...</div>;
    }

    if (!invoice) {
        return (
            <div className="p-12 text-center">
                <h2 className="mb-4 text-xl font-semibold">Invoice not found</h2>
                <Link href="/" className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Return to Dashboard
                </Link>
            </div>
        );
    }
    
    const subtotal = invoice.invoice_items.reduce((sum, item) => sum + (item.quantity * item.price_at_sale), 0);
    const returnValue = invoice.return_value ?? 0;
    const finalTotal = subtotal - returnValue;

    return (
        <div className="mx-auto max-w-4xl p-4 font-sans md:p-6 lg:p-8">
             <header className="mb-8">
                <Link href="/" className="mb-4 inline-flex items-center gap-2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <ArrowLeft size={18} /> Back to Dashboard
                </Link>
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">Invoice</h1>
                        <p className="text-muted-foreground">Details for invoice #{invoice.id.substring(0, 8)}</p>
                    </div>
                    <div className="sm:text-right">
                        <p className="text-muted-foreground">Final Amount</p>
                        <p className="text-3xl font-bold text-foreground sm:text-4xl">${finalTotal.toFixed(2)}</p>
                    </div>
                </div>
            </header>

            {/* ... other info cards ... */}
            <div className="mb-8 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                <Card className="flex items-center gap-4 p-4 shadow-sm">
                    <User className="text-muted-foreground" aria-hidden="true" />
                    <div>
                        <p className="text-muted-foreground">Client</p>
                        <p className="font-semibold text-card-foreground">{invoice.clients?.name}</p>
                    </div>
                </Card>
                <Card className="flex items-center gap-4 p-4 shadow-sm">
                    <Calendar className="text-muted-foreground" aria-hidden="true" />
                    <div>
                        <p className="text-muted-foreground">Date Issued</p>
                        <p className="font-semibold text-card-foreground">{new Date(invoice.created_at).toLocaleDateString()}</p>
                    </div>
                </Card>
                <Card className="flex items-center gap-4 p-4 shadow-sm">
                    <FileText className="text-muted-foreground" aria-hidden="true" />
                    <div>
                        <p className="text-muted-foreground">Status</p>
                        <p className="font-semibold text-primary">Paid / Completed</p>
                    </div>
                </Card>
            </div>


            <Card className="p-4 shadow-sm sm:p-6">
                 <h2 className="mb-4 text-xl font-semibold text-card-foreground">Invoice Items</h2>
                 <div className="overflow-x-auto">
                    <Table className="text-left">
                        <TableHeader className="bg-muted/50 uppercase">
                            <TableRow className="hover:bg-transparent">
                                <TableHead scope="col" className="px-4">Product</TableHead>
                                <TableHead scope="col" className="px-4 text-center">Quantity</TableHead>
                                <TableHead scope="col" className="px-4 text-center">Unit Price</TableHead>
                                <TableHead scope="col" className="px-4 text-right">Subtotal</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoice.invoice_items.map((item, index) => {
                                const itemSubtotal = item.quantity * item.price_at_sale;
                                return (
                                <TableRow key={index}>
                                    <TableCell className="px-4 py-4 font-medium">{item.product_name} ({item.product_size})</TableCell>
                                    <TableCell className="px-4 py-4 text-center">{item.quantity}</TableCell>
                                    <TableCell className="px-4 py-4 text-center">${item.price_at_sale.toFixed(2)}</TableCell>
                                    <TableCell className="px-4 py-4 text-right font-semibold">${itemSubtotal.toFixed(2)}</TableCell>
                                </TableRow>
                                );
                            })}
                        </TableBody>
                        <tfoot>
                            <tr className="border-t border-border font-semibold">
                                <td colSpan={3} className="px-4 py-4 text-right text-muted-foreground">Subtotal</td>
                                <td className="px-4 py-4 text-right text-foreground">${subtotal.toFixed(2)}</td>
                            </tr>
                            {returnValue > 0 && (
                                <tr className="font-semibold text-destructive">
                                    <td colSpan={3} className="px-4 py-4 text-right">
                                        Return <span className="text-xs font-normal italic text-muted-foreground">({invoice.return_comment})</span>
                                    </td>
                                    <td className="px-4 py-4 text-right">-${returnValue.toFixed(2)}</td>
                                </tr>
                            )}
                            <tr className="font-bold text-xl">
                                <td colSpan={3} className="px-4 py-4 text-right">Total</td>
                                <td className="px-4 py-4 text-right">${finalTotal.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </Table>
                 </div>
            </Card>
        </div>
    );
}

export default InvoiceDetailPage;
