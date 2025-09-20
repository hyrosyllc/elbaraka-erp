'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Product, Client, OrderNote, Invoice } from '../types';

// Import Components
import { InventoryTab } from '../components/InventoryTab';
import { ClientsTab } from '../components/ClientsTab';
import { OrderNotesTab } from '../components/OrderNotesTab';
import { InvoicesTab } from '../components/InvoicesTab';
import { Modal } from '../components/Modal';
import { FormInput } from '../components/FormInput';
import { PlusCircle, Trash2 } from 'lucide-react';

type Tab = 'inventory' | 'order_notes' | 'invoices' | 'clients';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('inventory');
  
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
    setLoading(true);
    try {
      const { data: productsData, error: productsError } = await supabase.from('products').select('*').order('name');
      if (productsError) throw productsError;
      setProducts(productsData);

      const { data: clientsData, error: clientsError } = await supabase.from('clients').select('*').order('name');
      if (clientsError) throw clientsError;
      setClients(clientsData);
      
      const { data: orderNotesData, error: orderNotesError } = await supabase.from('order_notes').select('*, clients(*), order_note_items(*, products(*))').order('created_at', { ascending: false });
      if (orderNotesError) throw orderNotesError;
      setOrderNotes(orderNotesData);

      const { data: invoicesData, error: invoicesError } = await supabase.from('invoices').select('*, clients(*), invoice_items(*)').order('created_at', { ascending: false });
      if (invoicesError) throw invoicesError;
      setInvoices(invoicesData);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('realtime-all').on('postgres_changes', { event: '*', schema: 'public' }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

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
        alert("Please select a client and add at least one item.");
        return;
    }

    // 1. Create the Order Note
    const { data: orderNote, error: orderNoteError } = await supabase
        .from('order_notes')
        .insert({ client_id: newOrderData.client_id, status: 'created' })
        .select()
        .single();

    if (orderNoteError) {
        console.error("Error creating order note:", orderNoteError);
        return;
    }
    
    // 2. Prepare and insert the items
    const itemsToInsert = newOrderData.items.map(item => ({
        order_note_id: orderNote.id,
        product_id: item.product_id,
        quantity: item.quantity
    }));
    
    const { error: itemsError } = await supabase.from('order_note_items').insert(itemsToInsert);

    if (itemsError) {
        console.error("Error adding order items:", itemsError);
    } else {
        fetchData(); // Refresh all data
        setIsNewOrderModalOpen(false);
        setNewOrderData({ client_id: '', items: [{ product_id: '', quantity: 1 }] });
    }
  };


  const renderTabContent = () => {
    if (loading) return <div className="text-center p-8">Loading data...</div>;

    switch (activeTab) {
      case 'inventory':
        return <InventoryTab products={products} supabase={supabase} onDataChange={fetchData} />;
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

  const TabButton = ({ tabName, label }: { tabName: Tab; label: string }) => (
    <button onClick={() => setActiveTab(tabName)} className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === tabName ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
      {label}
    </button>
  );

  return (
    <main className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Elbaraka ERP</h1>
          <p className="text-slate-500 mt-1">Manage your inventory, orders, and invoices with ease.</p>
        </header>
        <nav className="mb-8 flex space-x-2 p-1 bg-white rounded-lg shadow-sm w-full md:w-auto">
          <TabButton tabName="inventory" label="Inventory" />
          <TabButton tabName="order_notes" label="Order Notes" />
          <TabButton tabName="invoices" label="Invoices" />
          <TabButton tabName="clients" label="Clients" />
        </nav>
        <div>{renderTabContent()}</div>
      </div>

      {/* New Order Note Modal */}
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
                        <button type="button" onClick={() => removeNewOrderItem(index)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={18} /></button>
                    </div>
                ))}
                <button type="button" onClick={addNewOrderItem} className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                    <PlusCircle size={16} /> Add Item
                </button>
            </div>
            <div className="flex justify-end pt-2">
                <button type="submit" className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700">Create Order</button>
            </div>
        </form>
      </Modal>
    </main>
  );
}

