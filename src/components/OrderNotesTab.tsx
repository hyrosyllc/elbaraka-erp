import { FC } from 'react';
import { OrderNote } from '../types';
import { FileText, Plus } from 'lucide-react';
// import Link from 'next/link'; // Removed for compatibility

type Props = {
    orderNotes: OrderNote[];
    openNewOrderNoteModal: () => void;
};

export const OrderNotesTab: FC<Props> = ({ orderNotes, openNewOrderNoteModal }) => {
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Order Notes</h2>
                <button
                    onClick={openNewOrderNoteModal}
                    className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700"
                >
                    <Plus size={20} /> New Order
                </button>
            </div>
            <div className="space-y-4">
                {orderNotes && orderNotes.length > 0 ? (
                    orderNotes.map(note => (
                        <div key={note.id} className="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center">
                            <div>
                                <p className="font-bold">{note.clients?.name}</p>
                                <p className="text-sm text-slate-500">{new Date(note.created_at).toLocaleString()}</p>
                                <ul className="text-sm mt-2">
                                    {note.order_note_items && note.order_note_items.map((item, index) => (
                                        <li key={index} className="flex justify-between w-48">
                                            <span>{item.products?.name} ({item.products?.size})</span>
                                            <span>x {item.quantity}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                    note.status === 'created' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                                }`}>
                                    {note.status}
                                </span>
                                {note.status === 'created' && (
                                    <a 
                                        href={`/invoices/new?orderNoteId=${note.id}`}
                                        className="flex items-center gap-2 bg-green-500 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-green-600 text-sm"
                                    >
                                        <FileText size={16} /> Finalize Invoice
                                    </a>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <p>No order notes found.</p>
                )}
            </div>
        </div>
    );
};

