-- Invoices and payments: gapless per-year numbering, invoice issue from a
-- delivered delivery note, and payment recording with overpayment protection.
-- Tax rules are not legal advice: the rate is entered per invoice by a manager.

alter table public.erp_invoices
	add column if not exists idempotency_key uuid,
	add column if not exists due_date date,
	add column if not exists tax_rate_percent numeric(5, 2) not null default 0 check (tax_rate_percent >= 0 and tax_rate_percent <= 100),
	add column if not exists updated_at timestamptz not null default now();

alter table public.erp_payments
	add column if not exists idempotency_key uuid;

create unique index if not exists erp_invoices_idempotency_idx
	on public.erp_invoices (workspace_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists erp_payments_idempotency_idx
	on public.erp_payments (workspace_id, idempotency_key) where idempotency_key is not null;
create index if not exists erp_invoices_client_idx on public.erp_invoices (workspace_id, client_id);
create index if not exists erp_payments_invoice_idx on public.erp_payments (invoice_id);

create table if not exists public.erp_document_sequences (
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	sequence_code text not null,
	sequence_year integer not null,
	last_value integer not null default 0,
	primary key (workspace_id, sequence_code, sequence_year)
);
alter table public.erp_document_sequences enable row level security;
revoke all on public.erp_document_sequences from public, anon, authenticated;

create or replace function erp_private.erp_next_document_number(p_workspace_id uuid, p_code text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_year integer := extract(year from (now() at time zone 'Africa/Casablanca'))::integer;
	v_value integer;
begin
	insert into public.erp_document_sequences as s (workspace_id, sequence_code, sequence_year, last_value)
	values (p_workspace_id, p_code, v_year, 1)
	on conflict (workspace_id, sequence_code, sequence_year)
	do update set last_value = s.last_value + 1
	returning s.last_value into v_value;
	return p_prefix || '-' || v_year || '-' || lpad(v_value::text, 6, '0');
end;
$$;
revoke all on function erp_private.erp_next_document_number(uuid, text, text) from public, anon, authenticated;

create or replace function public.erp_issue_invoice(
	p_note_id uuid,
	p_tax_rate_percent numeric,
	p_due_date date,
	p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_existing uuid;
	v_note record;
	v_subtotal numeric(14, 2);
	v_tax numeric(14, 2);
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_tax_rate_percent is null or p_tax_rate_percent < 0 or p_tax_rate_percent > 100 then
		raise exception 'invalid_tax_rate' using errcode = 'P0001';
	end if;

	select i.id into v_existing from public.erp_invoices i
	where i.workspace_id = v_workspace_id and i.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	select n.id, n.status, n.client_id, n.client_name_snapshot into v_note
	from public.erp_delivery_notes n
	where n.id = p_note_id and n.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'delivery_note_not_found' using errcode = 'P0002';
	end if;
	if v_note.status <> 'delivered' then
		raise exception 'delivery_note_not_delivered' using errcode = 'P0001';
	end if;
	if exists (select 1 from public.erp_invoices i where i.delivery_note_id = p_note_id) then
		raise exception 'invoice_already_issued' using errcode = 'P0001';
	end if;

	select coalesce(sum(l.quantity * l.unit_price_mad), 0)::numeric(14, 2) into v_subtotal
	from public.erp_delivery_note_lines l where l.delivery_note_id = p_note_id;
	v_tax := round(v_subtotal * p_tax_rate_percent / 100, 2);

	insert into public.erp_invoices (
		id, workspace_id, document_number, delivery_note_id, client_id, client_name_snapshot,
		subtotal_mad, tax_mad, total_mad, issued_at, created_by,
		idempotency_key, due_date, tax_rate_percent
	) values (
		v_id, v_workspace_id,
		erp_private.erp_next_document_number(v_workspace_id, 'invoice', 'INV'),
		p_note_id, v_note.client_id, v_note.client_name_snapshot,
		v_subtotal, v_tax, v_subtotal + v_tax, now(), v_user_id,
		p_idempotency_key, p_due_date, p_tax_rate_percent
	);
	return v_id;
end;
$$;

create or replace function public.erp_record_payment(
	p_invoice_id uuid,
	p_amount_mad numeric,
	p_method text,
	p_paid_at timestamptz,
	p_reference text,
	p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_existing uuid;
	v_total numeric(14, 2);
	v_paid numeric(14, 2);
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_amount_mad is null or p_amount_mad <= 0 or p_amount_mad <> round(p_amount_mad, 2) then
		raise exception 'invalid_payment_amount' using errcode = 'P0001';
	end if;
	if p_method is null or p_method not in ('cash', 'bank_transfer', 'card', 'cheque', 'other') then
		raise exception 'invalid_payment_method' using errcode = 'P0001';
	end if;

	select p.id into v_existing from public.erp_payments p
	where p.workspace_id = v_workspace_id and p.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	select i.total_mad into v_total from public.erp_invoices i
	where i.id = p_invoice_id and i.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'invoice_not_found' using errcode = 'P0002';
	end if;

	select coalesce(sum(p.amount_mad), 0) into v_paid
	from public.erp_payments p where p.invoice_id = p_invoice_id;
	if v_paid + p_amount_mad > v_total then
		raise exception 'payment_exceeds_balance' using errcode = 'P0001';
	end if;

	insert into public.erp_payments (id, workspace_id, invoice_id, amount_mad, payment_method, paid_at, reference, created_by, idempotency_key)
	values (v_id, v_workspace_id, p_invoice_id, p_amount_mad, p_method, coalesce(p_paid_at, now()), left(coalesce(btrim(p_reference), ''), 120), v_user_id, p_idempotency_key);
	update public.erp_invoices set updated_at = now() where id = p_invoice_id;
	return v_id;
end;
$$;

revoke all on function public.erp_issue_invoice(uuid, numeric, date, uuid) from public, anon, authenticated;
revoke all on function public.erp_record_payment(uuid, numeric, text, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.erp_issue_invoice(uuid, numeric, date, uuid) to authenticated;
grant execute on function public.erp_record_payment(uuid, numeric, text, timestamptz, text, uuid) to authenticated;
