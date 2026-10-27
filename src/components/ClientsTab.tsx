import { Button } from '@/components/ui/button';
import { FC, useState } from 'react';
import { Client } from '../types';
import { PlusCircle, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { FormInput } from './FormInput';
import { SupabaseClient } from '@supabase/supabase-js';

type Props = {
    clients: Client[];
    supabase: SupabaseClient;
    onDataChange: () => void;
};

export const ClientsTab: FC<Props> = ({ clients, supabase, onDataChange }) => {
    // State for modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    
    // State for forms
    const [newClient, setNewClient] = useState({ name: '', contact_person: '', phone: '' });
    const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

    // --- Handlers ---

    const handleAddClient = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('clients').insert([newClient]);
        if (error) {
            console.error("Error adding client:", error);
        } else {
            onDataChange();
            setIsAddModalOpen(false);
            setNewClient({ name: '', contact_person: '', phone: '' });
        }
    };
    
    const handleUpdateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientToEdit) return;
        const { error } = await supabase
            .from('clients')
            .update({ 
                name: clientToEdit.name, 
                contact_person: clientToEdit.contact_person, 
                phone: clientToEdit.phone 
            })
            .eq('id', clientToEdit.id);

        if (error) {
            console.error("Error updating client:", error);
        } else {
            onDataChange();
            setIsEditModalOpen(false);
            setClientToEdit(null);
        }
    };
    
    const handleDeleteClient = async () => {
        if (!clientToDelete) return;
        
        const { error } = await supabase.from('clients').delete().eq('id', clientToDelete.id);
        if (error) {
            console.error("Error deleting client:", error);
        } else {
            onDataChange();
            setIsDeleteModalOpen(false);
            setClientToDelete(null);
        }
    };
    
    // --- Open Modal Triggers ---
    
    const openEditModal = (client: Client) => {
        setClientToEdit(client);
        setIsEditModalOpen(true);
    };
    
    const openDeleteModal = (client: Client) => {
        setClientToDelete(client);
        setIsDeleteModalOpen(true);
    };


    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Clients</h2>
                <Button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700"
                >
                    <PlusCircle size={20} /> New Client
                </Button>
            </div>
            {/* Clients Table */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left text-slate-500">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Client Name</th>
                            <th scope="col" className="px-6 py-3">Contact Person</th>
                            <th scope="col" className="px-6 py-3">Phone</th>
                            <th scope="col" className="px-6 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map(client => (
                            <tr key={client.id} className="bg-white border-b hover:bg-slate-50">
                                <th scope="row" className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{client.name}</th>
                                <td className="px-6 py-4">{client.contact_person}</td>
                                <td className="px-6 py-4">{client.phone}</td>
                                <td className="px-6 py-4 text-center space-x-2">
                                    <Button onClick={() => openEditModal(client)} className="font-medium text-blue-600 hover:underline p-1" title="Edit Client">
                                        <Edit size={18} />
                                    </Button>
                                    <Button onClick={() => openDeleteModal(client)} className="font-medium text-red-600 hover:underline p-1" title="Delete Client">
                                        <Trash2 size={18} />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Client Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Client">
                <form onSubmit={handleAddClient} className="space-y-4">
                    <FormInput label="Client Name" id="clientName" type="text" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} required />
                    <FormInput label="Contact Person" id="contactPerson" type="text" value={newClient.contact_person} onChange={(e) => setNewClient({ ...newClient, contact_person: e.target.value })} />
                    <FormInput label="Phone Number" id="phone" type="text" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                    <div className="flex justify-end pt-2">
                        <Button type="submit" className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700">Add Client</Button>
                    </div>
                </form>
            </Modal>

            {/* Edit Client Modal */}
            {clientToEdit && (
                <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit ${clientToEdit.name}`}>
                    <form onSubmit={handleUpdateClient} className="space-y-4">
                        <FormInput label="Client Name" id="editClientName" type="text" value={clientToEdit.name} onChange={(e) => setClientToEdit({ ...clientToEdit, name: e.target.value })} required />
                        <FormInput label="Contact Person" id="editContactPerson" type="text" value={clientToEdit.contact_person || ''} onChange={(e) => setClientToEdit({ ...clientToEdit, contact_person: e.target.value })} />
                        <FormInput label="Phone Number" id="editPhone" type="text" value={clientToEdit.phone || ''} onChange={(e) => setClientToEdit({ ...clientToEdit, phone: e.target.value })} />
                        <div className="flex justify-end pt-2">
                            <Button type="submit" className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700">Save Changes</Button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Delete Confirmation Modal */}
            {clientToDelete && (
                <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
                    <div className="text-center">
                        <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
                        <h3 className="mt-2 text-lg font-medium text-slate-900">
                            Delete client: {clientToDelete.name}?
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                            This action cannot be undone. All associated orders and invoices will remain but may no longer be linked to a client name.
                        </p>
                    </div>
                    <div className="mt-5 sm:mt-6 flex justify-center gap-3">
                        <Button
                            type="button"
                            className="inline-flex justify-center w-full rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:w-auto sm:text-sm"
                            onClick={handleDeleteClient}
                        >
                            Confirm Delete
                        </Button>
                        <Button
                            type="button"
                            className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:text-sm"
                            onClick={() => setIsDeleteModalOpen(false)}
                        >
                            Cancel
                        </Button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

