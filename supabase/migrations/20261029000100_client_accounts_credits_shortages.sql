-- Client account handling: invoice adjustments (return credits, discounts,
-- corrections, cash refunds), follow-up notes with promised payment dates, and
-- delivery with shortages (items missing at the door go back to stock and stay
-- reserved on the order so they can be shipped later).
--
-- Sign convention for erp_invoice_adjustments.amount_mad:
--   negative = reduces what the client owes (credit, discount, correction)
--   positive = money handed back to the client (refund of an overpayment)
-- Invoice balance = total_mad + sum(adjustments) - sum(payments).
-- A negative balance is a credit in the client's favour.

create table if not exists public.erp_invoice_adjustments (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	invoice_id uuid not null references public.erp_invoices(id) on delete restrict,
	client_id uuid not null references public.erp_clients(id) on delete restrict,
	kind text not null check (kind in ('return_credit', 'discount', 'correction', 'refund')),
	amount_mad numeric(14, 2) not null check (amount_mad <> 0),
	description text not null check (char_length(btrim(description)) between 1 and 300),
	idempotency_key uuid,
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	constraint erp_invoice_adjustments_sign_check check (
		(kind = 'refund' and amount_mad > 0) or (kind <> 'refund' and amount_mad < 0)
	)
);

create unique index if not exists erp_invoice_adjustments_idempotency_idx
	on public.erp_invoice_adjustments (workspace_id, idempotency_key) where idempotency_key is not null;
create index if not exists erp_invoice_adjustments_invoice_idx on public.erp_invoice_adjustments (invoice_id);
create index if not exists erp_invoice_adjustments_client_idx on public.erp_invoice_adjustments (workspace_id, client_id, created_at desc);

create table if not exists public.erp_client_notes (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	client_id uuid not null references public.erp_clients(id) on delete restrict,
	invoice_id uuid references public.erp_invoices(id) on delete restrict,
	kind text not null check (kind in ('note', 'promise_to_pay', 'call', 'visit')),
	note text not null check (char_length(btrim(note)) between 1 and 500),
	promised_date date,
	is_resolved boolean not null default false,
	resolved_at timestamptz,
	idempotency_key uuid,
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict
);

create unique index if not exists erp_client_notes_idempotency_idx
	on public.erp_client_notes (workspace_id, idempotency_key) where idempotency_key is not null;
create index if not exists erp_client_notes_client_idx on public.erp_client_notes (workspace_id, client_id, created_at desc);
create index if not exists erp_client_notes_invoice_idx on public.erp_client_notes (invoice_id) where invoice_id is not null;

do $$
declare
	table_name text;
begin
	foreach table_name in array array['erp_invoice_adjustments', 'erp_client_notes'] loop
		execute format('alter table public.%I enable row level security', table_name);
		execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
		execute format('grant select on table public.%I to authenticated', table_name);
		execute format('drop policy if exists "manager read" on public.%I', table_name);
		execute format(
			'create policy "manager read" on public.%I for select to authenticated using (workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code = ''manager''))',
			table_name
		);
	end loop;
end;
$$;

-- Payments may not exceed what is still owed after adjustments.
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
	v_adjusted numeric(14, 2);
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

	select coalesce(sum(a.amount_mad), 0) into v_adjusted
	from public.erp_invoice_adjustments a where a.invoice_id = p_invoice_id;
	select coalesce(sum(p.amount_mad), 0) into v_paid
	from public.erp_payments p where p.invoice_id = p_invoice_id;
	if v_paid + p_amount_mad > v_total + v_adjusted then
		raise exception 'payment_exceeds_balance' using errcode = 'P0001';
	end if;

	insert into public.erp_payments (id, workspace_id, invoice_id, amount_mad, payment_method, paid_at, reference, created_by, idempotency_key)
	values (v_id, v_workspace_id, p_invoice_id, p_amount_mad, p_method, coalesce(p_paid_at, now()), left(coalesce(btrim(p_reference), ''), 120), v_user_id, p_idempotency_key);
	update public.erp_invoices set updated_at = now() where id = p_invoice_id;
	return v_id;
end;
$$;

create or replace function public.erp_add_invoice_adjustment(
	p_invoice_id uuid,
	p_kind text,
	p_amount_mad numeric,
	p_description text,
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
	v_client_id uuid;
	v_adjusted numeric(14, 2);
	v_paid numeric(14, 2);
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_kind is null or p_kind not in ('return_credit', 'discount', 'correction', 'refund') then
		raise exception 'invalid_adjustment_kind' using errcode = 'P0001';
	end if;
	if p_amount_mad is null or p_amount_mad <= 0 or p_amount_mad <> round(p_amount_mad, 2) then
		raise exception 'invalid_adjustment_amount' using errcode = 'P0001';
	end if;
	if char_length(btrim(coalesce(p_description, ''))) not between 1 and 300 then
		raise exception 'adjustment_description_required' using errcode = 'P0001';
	end if;

	select a.id into v_existing from public.erp_invoice_adjustments a
	where a.workspace_id = v_workspace_id and a.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	select i.total_mad, i.client_id into v_total, v_client_id from public.erp_invoices i
	where i.id = p_invoice_id and i.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'invoice_not_found' using errcode = 'P0002';
	end if;

	select coalesce(sum(a.amount_mad), 0) into v_adjusted
	from public.erp_invoice_adjustments a where a.invoice_id = p_invoice_id;
	select coalesce(sum(p.amount_mad), 0) into v_paid
	from public.erp_payments p where p.invoice_id = p_invoice_id;

	if p_kind = 'refund' then
		if p_amount_mad > v_paid - (v_total + v_adjusted) then
			raise exception 'refund_exceeds_credit' using errcode = 'P0001';
		end if;
	elsif v_total + v_adjusted - p_amount_mad < 0 then
		raise exception 'adjustment_exceeds_invoice' using errcode = 'P0001';
	end if;

	insert into public.erp_invoice_adjustments (
		id, workspace_id, invoice_id, client_id, kind, amount_mad, description, idempotency_key, created_by
	) values (
		v_id, v_workspace_id, p_invoice_id, v_client_id, p_kind,
		case when p_kind = 'refund' then p_amount_mad else -p_amount_mad end,
		btrim(p_description), p_idempotency_key, v_user_id
	);
	update public.erp_invoices set updated_at = now() where id = p_invoice_id;
	return v_id;
end;
$$;

create or replace function public.erp_add_client_note(
	p_client_id uuid,
	p_invoice_id uuid,
	p_kind text,
	p_note text,
	p_promised_date date,
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
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_kind is null or p_kind not in ('note', 'promise_to_pay', 'call', 'visit') then
		raise exception 'invalid_note_kind' using errcode = 'P0001';
	end if;
	if char_length(btrim(coalesce(p_note, ''))) not between 1 and 500 then
		raise exception 'note_required' using errcode = 'P0001';
	end if;
	if p_kind = 'promise_to_pay' and p_promised_date is null then
		raise exception 'promised_date_required' using errcode = 'P0001';
	end if;

	select n.id into v_existing from public.erp_client_notes n
	where n.workspace_id = v_workspace_id and n.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	if not exists (select 1 from public.erp_clients c where c.id = p_client_id and c.workspace_id = v_workspace_id) then
		raise exception 'client_not_found' using errcode = 'P0002';
	end if;
	if p_invoice_id is not null and not exists (
		select 1 from public.erp_invoices i
		where i.id = p_invoice_id and i.workspace_id = v_workspace_id and i.client_id = p_client_id
	) then
		raise exception 'invoice_not_found' using errcode = 'P0002';
	end if;

	insert into public.erp_client_notes (id, workspace_id, client_id, invoice_id, kind, note, promised_date, idempotency_key, created_by)
	values (v_id, v_workspace_id, p_client_id, p_invoice_id, p_kind, btrim(p_note),
		case when p_kind = 'promise_to_pay' then p_promised_date else null end, p_idempotency_key, v_user_id);
	return v_id;
end;
$$;

create or replace function public.erp_resolve_client_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
begin
	select r.workspace_id into v_workspace_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	update public.erp_client_notes
	set is_resolved = true, resolved_at = now()
	where id = p_note_id and workspace_id = v_workspace_id and not is_resolved;
	if not found then
		raise exception 'note_not_found' using errcode = 'P0002';
	end if;
end;
$$;

-- Delivers a dispatched note when some items are missing at the door. Missing
-- quantities leave the note, return to the warehouse and are re-reserved on the
-- order, which stays part delivered so the rest can be shipped later.
create or replace function public.erp_deliver_delivery_note_with_shortages(
	p_note_id uuid,
	p_shortages jsonb,
	p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order_id uuid;
	v_status text;
	v_short record;
	v_line record;
	v_move record;
	v_need numeric;
	v_take numeric;
	v_seen uuid[] := '{}';
	v_lines_left integer;
	v_open_lines integer;
begin
	select a.workspace_id, a.user_id, a.order_id, a.status into v_workspace_id, v_user_id, v_order_id, v_status
	from erp_private.erp_delivery_actor(p_note_id) a;

	if v_status <> 'dispatched' then
		raise exception 'delivery_note_not_dispatched' using errcode = 'P0001';
	end if;
	if p_shortages is null or jsonb_typeof(p_shortages) <> 'array' or jsonb_array_length(p_shortages) not between 1 and 100 then
		raise exception 'invalid_shortages' using errcode = 'P0001';
	end if;
	if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 300 then
		raise exception 'shortage_reason_required' using errcode = 'P0001';
	end if;

	for v_short in
		select (e->>'lineId')::uuid as line_id, (e->>'quantity')::integer as quantity
		from jsonb_array_elements(p_shortages) e
	loop
		if v_short.line_id is null or v_short.quantity is null or v_short.quantity <= 0 or v_short.line_id = any (v_seen) then
			raise exception 'invalid_shortages' using errcode = 'P0001';
		end if;
		v_seen := v_seen || v_short.line_id;

		select dl.id, dl.item_id, dl.quantity into v_line
		from public.erp_delivery_note_lines dl
		where dl.id = v_short.line_id and dl.delivery_note_id = p_note_id
		for update;
		if not found or v_short.quantity > v_line.quantity then
			raise exception 'invalid_shortages' using errcode = 'P0001';
		end if;

		v_need := v_short.quantity;
		for v_move in
			select m.location_id, m.lot_id, -m.quantity_delta as quantity
			from public.inventory_movements m
			where m.workspace_id = v_workspace_id and m.reference_type = 'delivery_note'
				and m.reference_id = p_note_id and m.movement_type = 'shipment' and m.item_id = v_line.item_id
			order by m.recorded_at, m.id
		loop
			exit when v_need <= 0;
			v_take := least(v_need, v_move.quantity);
			insert into public.inventory_movements (
				workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
				reference_type, reference_id, idempotency_key, recorded_by
			) values (
				v_workspace_id, v_line.item_id, v_move.location_id, v_move.lot_id, 'customer_return', v_take,
				'delivery_note_short', p_note_id, gen_random_uuid(), v_user_id
			);
			insert into public.inventory_reservations (
				workspace_id, item_id, location_id, lot_id, quantity, source_type, source_id,
				status, idempotency_key, reserved_by
			) values (
				v_workspace_id, v_line.item_id, v_move.location_id, v_move.lot_id, v_take, 'sales_order', v_order_id,
				'active', gen_random_uuid(), v_user_id
			);
			v_need := v_need - v_take;
		end loop;
		if v_need > 0 then
			raise exception 'invalid_shortages' using errcode = 'P0001';
		end if;

		if v_short.quantity = v_line.quantity then
			delete from public.erp_delivery_note_lines where id = v_line.id;
		else
			update public.erp_delivery_note_lines set quantity = quantity - v_short.quantity where id = v_line.id;
		end if;
	end loop;

	select count(*) into v_lines_left from public.erp_delivery_note_lines where delivery_note_id = p_note_id;
	if v_lines_left = 0 then
		raise exception 'all_items_short' using errcode = 'P0001';
	end if;

	update public.erp_delivery_notes
	set status = 'delivered', delivered_at = now(), updated_at = now()
	where id = p_note_id;

	select count(*) into v_open_lines
	from public.erp_sales_order_lines l
	where l.order_id = v_order_id
		and l.quantity > coalesce((
			select sum(dl.quantity)
			from public.erp_delivery_note_lines dl
			join public.erp_delivery_notes dn on dn.id = dl.delivery_note_id
			where dl.order_line_id = l.id and dn.status = 'delivered'
		), 0);

	update public.erp_sales_orders
	set status = case when v_open_lines = 0 then 'delivered' else 'part_delivered' end, updated_at = now()
	where id = v_order_id;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, v_order_id, 'delivered', v_user_id,
		jsonb_build_object('deliveryNoteId', p_note_id, 'complete', v_open_lines = 0, 'shortages', p_shortages, 'reason', btrim(p_reason)));
end;
$$;

revoke all on function public.erp_record_payment(uuid, numeric, text, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_add_invoice_adjustment(uuid, text, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_add_client_note(uuid, uuid, text, text, date, uuid) from public, anon, authenticated;
revoke all on function public.erp_resolve_client_note(uuid) from public, anon, authenticated;
revoke all on function public.erp_deliver_delivery_note_with_shortages(uuid, jsonb, text) from public, anon, authenticated;

grant execute on function public.erp_record_payment(uuid, numeric, text, timestamptz, text, uuid) to authenticated;
grant execute on function public.erp_add_invoice_adjustment(uuid, text, numeric, text, uuid) to authenticated;
grant execute on function public.erp_add_client_note(uuid, uuid, text, text, date, uuid) to authenticated;
grant execute on function public.erp_resolve_client_note(uuid) to authenticated;
grant execute on function public.erp_deliver_delivery_note_with_shortages(uuid, jsonb, text) to authenticated;
