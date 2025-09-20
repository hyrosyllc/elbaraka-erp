// --- Base Types for Database Tables ---

export type Product = {
    id: string;
    created_at: string;
    name: string;
    size: string;
    live_stock: number;
};

export type Client = {
    id: string;
    created_at: string;
    name: string;
    contact_person: string | null;
    phone: string | null;
};

export type Invoice = {
    id: string;
    created_at: string;
    client_id: string;
    original_order_id: string | null;
    return_value: number | null;
    return_comment: string | null;
    // Relational properties (populated by Supabase joins)
    clients: Client | null;
    invoice_items: InvoiceItem[];
};

export type InvoiceItem = {
    id: string;
    invoice_id: string;
    product_id: string;
    product_name: string;
    product_size: string;
    quantity: number;
    price_at_sale: number;
};

export type OrderNoteItem = {
    id: string;
    order_note_id: string;
    product_id: string;
    quantity: number;
    // Relational property
    products: Product | null;
};

export type OrderNote = {
    id: string;
    created_at: string;
    client_id: string;
    status: 'created' | 'completed' | 'canceled';
    // Relational properties (populated by Supabase joins)
    clients: Client | null;
    order_note_items: OrderNoteItem[];
};

