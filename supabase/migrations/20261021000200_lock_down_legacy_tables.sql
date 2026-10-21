alter table public.clients enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoices enable row level security;
alter table public.order_note_items enable row level security;
alter table public.order_notes enable row level security;
alter table public.products enable row level security;

revoke all privileges on table
  public.clients,
  public.invoice_items,
  public.invoices,
  public.order_note_items,
  public.order_notes,
  public.products
from anon;
