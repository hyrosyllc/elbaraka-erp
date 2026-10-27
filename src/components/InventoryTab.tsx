import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FC, useState } from 'react';
import { Product, OrderNote } from '../types';
import { PlusCircle, Edit, Trash2, AlertTriangle, X } from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Inlined Components to resolve import errors ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <Button onClick={onClose} className="text-slate-500 hover:text-slate-800"><X size={24} /></Button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const FormInput = ({ id, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    <Input id={id} {...props} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
  </div>
);


// --- Main InventoryTab Component ---

type Props = {
    products: Product[];
    orderNotes: OrderNote[];
    supabase: SupabaseClient;
    onDataChange: () => void;
};

export const InventoryTab: FC<Props> = ({ products, orderNotes, supabase, onDataChange }) => {
    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    
    const [newProduct, setNewProduct] = useState({ name: '', size: '' });
    const [activeProduct, setActiveProduct] = useState<Product | null>(null);
    const [stockToAdd, setStockToAdd] = useState(0);

    // --- Calculation ---
    const calculatePostOrderStock = (product: Product) => {
        let reservedQuantity = 0;
        // The check (orderNotes || []) ensures we don't call .filter on an undefined value.
        const activeOrderNotes = (orderNotes || []).filter(note => note && note.status === 'created');

        for (const note of activeOrderNotes) {
            for (const item of note.order_note_items) {
                // Assuming item has product_id, not the full product object
                if (item.product_id === product.id) {
                    reservedQuantity += item.quantity;
                }
            }
        }
        return (product.live_stock || 0) - reservedQuantity;
    };


    // --- Handlers ---
    const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('products').insert([{ ...newProduct, live_stock: 0 }]);
        if (error) console.error("Error adding product:", error);
        else {
            onDataChange();
            setIsAddProductModalOpen(false);
            setNewProduct({ name: '', size: '' });
        }
    };

    const handleAddStock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeProduct) return;
        const newStock = (activeProduct.live_stock || 0) + Number(stockToAdd);
        const { error } = await supabase.from('products').update({ live_stock: newStock }).eq('id', activeProduct.id);
        if (error) console.error("Error adding stock:", error);
        else {
            onDataChange();
            setIsAddStockModalOpen(false);
            setActiveProduct(null);
            setStockToAdd(0);
        }
    };

    const handleUpdateProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeProduct) return;
        const { error } = await supabase.from('products').update({ name: activeProduct.name, size: activeProduct.size }).eq('id', activeProduct.id);
        if (error) console.error("Error updating product:", error);
        else {
            onDataChange();
            setIsEditModalOpen(false);
            setActiveProduct(null);
        }
    };

    const handleDeleteProduct = async () => {
        if (!activeProduct) return;
        const { error } = await supabase.from('products').delete().eq('id', activeProduct.id);
        if (error) console.error("Error deleting product:", error);
        else {
            onDataChange();
            setIsDeleteModalOpen(false);
            setActiveProduct(null);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Inventory</h2>
                <Button
                    onClick={() => setIsAddProductModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700"
                >
                    <PlusCircle size={20} /> New Product
                </Button>
            </div>
            {/* Inventory Table */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left text-slate-500">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Product Name</th>
                            <th scope="col" className="px-6 py-3">Size</th>
                            <th scope="col" className="px-6 py-3 text-center">Live Stock</th>
                            <th scope="col" className="px-6 py-3 text-center">Post-Order Stock</th>
                            <th scope="col" className="px-6 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map(product => {
                            const postOrderStock = calculatePostOrderStock(product);
                            return (
                                <tr key={product.id} className="bg-white border-b hover:bg-slate-50">
                                    <th scope="row" className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{product.name}</th>
                                    <td className="px-6 py-4">{product.size}</td>
                                    <td className="px-6 py-4 text-center font-bold">{product.live_stock}</td>
                                    <td className={`px-6 py-4 text-center font-bold ${postOrderStock <= 0 ? 'text-red-500' : ''}`}>
                                        {postOrderStock}
                                    </td>
                                    <td className="px-6 py-4 text-center space-x-2">
                                        <Button onClick={() => { setActiveProduct(product); setIsAddStockModalOpen(true); }} className="font-medium text-green-600 hover:underline p-1" title="Add Stock"><PlusCircle size={18} /></Button>
                                        <Button onClick={() => { setActiveProduct(product); setIsEditModalOpen(true); }} className="font-medium text-blue-600 hover:underline p-1" title="Edit Product"><Edit size={18} /></Button>
                                        <Button onClick={() => { setActiveProduct(product); setIsDeleteModalOpen(true); }} className="font-medium text-red-600 hover:underline p-1" title="Delete Product"><Trash2 size={18} /></Button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* --- All Modals --- */}
            <Modal isOpen={isAddProductModalOpen} onClose={() => setIsAddProductModalOpen(false)} title="Add New Product">
                <form onSubmit={handleAddProduct} className="space-y-4">
                    <FormInput label="Product Name" id="productName" type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} required />
                    <FormInput label="Size (e.g., 50g, 1kg)" id="productSize" type="text" value={newProduct.size} onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })} required />
                    <div className="flex justify-end pt-2"><Button type="submit" className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700">Add Product</Button></div>
                </form>
            </Modal>

            {activeProduct && (
                <Modal isOpen={isAddStockModalOpen} onClose={() => { setIsAddStockModalOpen(false); setActiveProduct(null); }} title={`Add Stock for ${activeProduct.name}`}>
                    <form onSubmit={handleAddStock} className="space-y-4">
                        <p className="text-sm">Current Stock: <span className="font-bold">{activeProduct.live_stock}</span></p>
                        <FormInput label="Quantity to Add" id="stockQuantity" type="number" value={stockToAdd} onChange={(e) => setStockToAdd(Number(e.target.value))} min="1" required />
                        <div className="flex justify-end pt-2"><Button type="submit" className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-green-700">Confirm</Button></div>
                    </form>
                </Modal>
            )}

            {activeProduct && (
                <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setActiveProduct(null); }} title={`Edit ${activeProduct.name}`}>
                    <form onSubmit={handleUpdateProduct} className="space-y-4">
                        <FormInput label="Product Name" id="editProductName" type="text" value={activeProduct.name} onChange={(e) => setActiveProduct({ ...activeProduct, name: e.target.value })} required />
                        <FormInput label="Size" id="editProductSize" type="text" value={activeProduct.size} onChange={(e) => setActiveProduct({ ...activeProduct, size: e.target.value })} required />
                        <div className="flex justify-end pt-2"><Button type="submit" className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700">Save Changes</Button></div>
                    </form>
                </Modal>
            )}

            {activeProduct && (
                <Modal isOpen={isDeleteModalOpen} onClose={() => { setIsDeleteModalOpen(false); setActiveProduct(null); }} title="Confirm Deletion">
                    <div className="text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">Delete Product</h3>
                        <p className="text-sm text-gray-500 mt-2 px-4">Are you sure you want to delete <span className="font-bold">{activeProduct.name} ({activeProduct.size})</span>? This action cannot be undone.</p>
                        <div className="items-center px-4 py-3 mt-4 space-x-4">
                            <Button onClick={handleDeleteProduct} className="px-4 py-2 bg-red-600 text-white rounded-md shadow-sm hover:bg-red-700">Delete</Button>
                            <Button onClick={() => { setIsDeleteModalOpen(false); setActiveProduct(null); }} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

