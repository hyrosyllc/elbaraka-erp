'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { PlusCircle, Trash2, Edit, X, Package, Users, FileText, Receipt } from 'lucide-react';

// --- Types (assuming they are defined elsewhere, but including here for clarity) ---
// In a real app, these would be in a types.ts file
export interface Product {
  id: string;
  name: string;
  size: string;
  initial_stock: number;
}

export interface Client {
  id: string;
  name: string;
  phone_number?: string;
  address?: string;
}

export interface OrderNoteItem {
  id: string;
  quantity: number;
  products: Product;
}

export interface OrderNote {
  id: string;
  created_at: string;
  status: 'created' | 'invoiced' | 'cancelled';
  clients: Client;
  order_note_items: OrderNoteItem[];
}

export interface Invoice {
  id: string;
  created_at: string;
  clients: Client;
  // Add more invoice properties as needed
}


// --- UI Components (Inlined to resolve import errors) ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800"><X size={24} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const FormInput = ({ id, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    <input id={id} {...props} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
  </div>
);

// --- Tab Components (Inlined to resolve import errors) ---

const InventoryTab = ({ products, orderNotes, supabase, onDataChange }: { products: Product[], orderNotes: OrderNote[], supabase: any, onDataChange: () => void }) => {
    const calculatePostOrderStock = (product: Product) => {
        const activeOrderNotes = (orderNotes || []).filter(note => note.status === 'created');
        let reservedQuantity = 0;
        for (const note of activeOrderNotes) {
            for (const item of note.order_note_items) {
                if (item.products && item.products.id === product.id) {
                    reservedQuantity += item.quantity;
                }
            }
        }
        return product.initial_stock - reservedQuantity;
    };
    
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-800 mb-4">Inventory Management</h2>
         <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Product Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Size</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Initial Stock</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Post-Order Stock</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                    {products.map(product => (
                        <tr key={product.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{product.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{product.size}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{product.initial_stock}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-indigo-600">{calculatePostOrderStock(product)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};


const ClientsTab = ({ clients, supabase, onDataChange }: { clients: Client[], supabase: any, onDataChange: () => void }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-800 mb-4">Clients</h2>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Address</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                    {clients.map(client => (
                        <tr key={client.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{client.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{client.phone_number}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{client.address}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const OrderNotesTab = ({ orderNotes, openNewOrderNoteModal }: { orderNotes: OrderNote[], openNewOrderNoteModal: () => void }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-slate-800">Order Notes</h2>
            <button onClick={openNewOrderNoteModal} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700">
                <PlusCircle size={18} /> New Order
            </button>
        </div>
        <div className="space-y-4">
            {orderNotes.map(note => (
                <div key={note.id} className="border border-slate-200 p-4 rounded-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-semibold text-slate-800">{note.clients.name}</p>
                            <p className="text-sm text-slate-500">Date: {new Date(note.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${note.status === 'created' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{note.status}</span>
                    </div>
                    <ul className="mt-2 list-disc list-inside text-sm text-slate-600">
                        {note.order_note_items.map(item => (
                            <li key={item.id}>{item.products.name} ({item.products.size}) - Qty: {item.quantity}</li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    </div>
);

const InvoicesTab = ({ invoices }: { invoices: Invoice[] }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-800 mb-4">Invoices</h2>
        <div className="space-y-3">
             {invoices.map(invoice => (
                <div key={invoice.id} className="border border-slate-200 p-4 rounded-lg flex justify-between items-center">
                    <div>
                        <p className="font-semibold text-slate-800">{invoice.clients.name}</p>
                        <p className="text-sm text-slate-500">Invoice ID: {invoice.id.substring(0,8)}...</p>
                    </div>
                    <p className="text-sm text-slate-500">{new Date(invoice.created_at).toLocaleDateString()}</p>
                </div>
            ))}
        </div>
    </div>
);

type Tab = 'inventory' | 'order_notes' | 'invoices' | 'clients';

// --- Main Page Component ---
export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('inventory');
  
  // --- Supabase Client ---
  // Standard client setup. Replace with your actual URL and anon key.
  const [supabase] = useState(() => 
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )
  );
  
  // --- Data State ---
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [orderNotes, setOrderNotes] = useState<OrderNote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- Modal State ---
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [newOrderData, setNewOrderData] = useState<{ client_id: string; items: { product_id: string; quantity: number }[] }>({ client_id: '', items: [{ product_id: '', quantity: 1 }] });

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    try {
      const { data: productsData, error: productsError } = await supabase.from('products').select('*').order('name');
      if (productsError) throw productsError;
      setProducts(productsData || []);

      const { data: clientsData, error: clientsError } = await supabase.from('clients').select('*').order('name');
      if (clientsError) throw clientsError;
      setClients(clientsData || []);
      
      const { data: orderNotesData, error: orderNotesError } = await supabase.from('order_notes').select('*, clients(*), order_note_items(*, products(*))').order('created_at', { ascending: false });
      if (orderNotesError) throw orderNotesError;
      setOrderNotes(orderNotesData || []);

      const { data: invoicesData, error: invoicesError } = await supabase.from('invoices').select('*, clients(*), invoice_items(*)').order('created_at', { ascending: false });
      if (invoicesError) throw invoicesError;
      setInvoices(invoicesData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('realtime-all').on('postgres_changes', { event: '*', schema: 'public' }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, supabase]);

  // --- New Order Note Handlers ---
  const handleNewOrderItemChange = (index: number, field: 'product_id' | 'quantity', value: string | number) => {
    const updatedItems = [...newOrderData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setNewOrderData({ ...newOrderData, items: updatedItems });
  };

  const addNewOrderItem = () => {
    setNewOrderData({ ...newOrderData, items: [...newOrderData.items, { product_id: '', quantity: 1 }] });
  };

  const removeNewOrderItem = (index: number) => {
    const updatedItems = newOrderData.items.filter((_, i) => i !== index);
    setNewOrderData({ ...newOrderData, items: updatedItems });
  };
  
  const handleCreateOrderNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderData.client_id || newOrderData.items.length === 0) {
        console.error("Please select a client and add at least one item.");
        return;
    }

    const { data: orderNote, error: orderNoteError } = await supabase.from('order_notes').insert({ client_id: newOrderData.client_id, status: 'created' }).select().single();
    if (orderNoteError) { console.error("Error creating order note:", orderNoteError); return; }
    
    const itemsToInsert = newOrderData.items.map(item => ({ order_note_id: orderNote.id, product_id: item.product_id, quantity: item.quantity }));
    const { error: itemsError } = await supabase.from('order_note_items').insert(itemsToInsert);

    if (itemsError) { console.error("Error adding order items:", itemsError); } 
    else {
        setIsNewOrderModalOpen(false);
        setNewOrderData({ client_id: '', items: [{ product_id: '', quantity: 1 }] });
    }
  };


  const renderTabContent = () => {
    if (loading) return <div className="text-center p-8">Loading data...</div>;

    switch (activeTab) {
      case 'inventory':
        return <InventoryTab products={products} orderNotes={orderNotes} supabase={supabase} onDataChange={fetchData} />;
      case 'clients':
        return <ClientsTab clients={clients} supabase={supabase} onDataChange={fetchData} />;
      case 'order_notes':
        return <OrderNotesTab orderNotes={orderNotes} openNewOrderNoteModal={() => setIsNewOrderModalOpen(true)} />;
      case 'invoices':
        return <InvoicesTab invoices={invoices} />;
      default:
        return null;
    }
  };

  const TabButton = ({ tabName, label, icon }: { tabName: Tab; label: string, icon: React.ReactNode }) => (
    <button onClick={() => setActiveTab(tabName)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tabName ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
        {icon} {label}
    </button>
  );

  return (
    <main className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Elbaraka ERP</h1>
          <p className="text-slate-500 mt-1">Manage your inventory, orders, and invoices with ease.</p>
        </header>
        <nav className="mb-8 flex flex-wrap gap-2 p-1 bg-white rounded-lg shadow-sm w-full md:w-auto">
          <TabButton tabName="inventory" label="Inventory" icon={<Package size={16}/>} />
          <TabButton tabName="order_notes" label="Order Notes" icon={<FileText size={16}/>} />
          <TabButton tabName="invoices" label="Invoices" icon={<Receipt size={16}/>} />
          <TabButton tabName="clients" label="Clients" icon={<Users size={16}/>} />
        </nav>
        <div>{renderTabContent()}</div>
      </div>

      <Modal isOpen={isNewOrderModalOpen} onClose={() => setIsNewOrderModalOpen(false)} title="Create New Order Note">
        <form onSubmit={handleCreateOrderNote} className="space-y-4">
            <div>
                <label htmlFor="client" className="block text-sm font-medium text-slate-700 mb-1">Client</label>
                <select id="client" value={newOrderData.client_id} onChange={(e) => setNewOrderData({ ...newOrderData, client_id: e.target.value })} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required>
                    <option value="" disabled>Select a client</option>
                    {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
            </div>
            <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Items</label>
                {newOrderData.items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <select value={item.product_id} onChange={(e) => handleNewOrderItemChange(index, 'product_id', e.target.value)} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required>
                            <option value="" disabled>Select a product</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.size})</option>)}
                        </select>
                        <input type="number" value={item.quantity} onChange={(e) => handleNewOrderItemChange(index, 'quantity', Number(e.target.value))} className="block w-24 px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" min="1" required />
                        {newOrderData.items.length > 1 && 
                            <button type="button" onClick={() => removeNewOrderItem(index)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={18} /></button>
                        }
                    </div>
                ))}
                <button type="button" onClick={addNewOrderItem} className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                    <PlusCircle size={16} /> Add Item
                </button>
            </div>
            <div className="flex justify-end pt-2 gap-3">
                 <button type="button" onClick={() => setIsNewOrderModalOpen(false)} className="bg-slate-100 text-slate-700 font-bold py-2 px-4 rounded-lg hover:bg-slate-200">Cancel</button>
                <button type="submit" className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700">Create Order</button>
            </div>
        </form>
      </Modal>
    </main>
  );
}

