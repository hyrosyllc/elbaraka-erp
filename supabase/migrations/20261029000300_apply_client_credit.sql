-- Moves a client's overpaid credit from one invoice to another invoice of the
-- same client in a single transaction: a positive (refund-kind) adjustment on
-- the source invoice and an 'other' payment on the target invoice.
create or replace function public.erp_apply_client_credit(
	p_from_invoice_id uuid,
	p_to_invoice_id uuid,
	p_amount_mad numeric,
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
	v_from record;
	v_to record;
	v_from_adjusted numeric(14, 2);
	v_from_paid numeric(14, 2);
	v_to_adjusted numeric(14, 2);
	v_to_paid numeric(14, 2);
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_amount_mad is null or p_amount_mad <= 0 or p_amount_mad <> round(p_amount_mad, 2) then
		raise exception 'invalid_adjustment_amount' using errcode = 'P0001';
	end if;
	if p_from_invoice_id = p_to_invoice_id then
		raise exception 'credit_same_invoice' using errcode = 'P0001';
	end if;

	select a.id into v_existing from public.erp_invoice_adjustments a
	where a.workspace_id = v_workspace_id and a.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	-- Lock in id order so two opposite transfers cannot deadlock.
	perform 1 from public.erp_invoices i
	where i.id in (p_from_invoice_id, p_to_invoice_id) and i.workspace_id = v_workspace_id
	order by i.id for update;

	select i.id, i.client_id, i.total_mad, i.document_number into v_from
	from public.erp_invoices i where i.id = p_from_invoice_id and i.workspace_id = v_workspace_id;
	select i.id, i.client_id, i.total_mad, i.document_number into v_to
	from public.erp_invoices i where i.id = p_to_invoice_id and i.workspace_id = v_workspace_id;
	if v_from.id is null or v_to.id is null then
		raise exception 'invoice_not_found' using errcode = 'P0002';
	end if;
	if v_from.client_id is distinct from v_to.client_id then
		raise exception 'credit_client_mismatch' using errcode = 'P0001';
	end if;

	select coalesce(sum(a.amount_mad), 0) into v_from_adjusted from public.erp_invoice_adjustments a where a.invoice_id = v_from.id;
	select coalesce(sum(p.amount_mad), 0) into v_from_paid from public.erp_payments p where p.invoice_id = v_from.id;
	if p_amount_mad > v_from_paid - (v_from.total_mad + v_from_adjusted) then
		raise exception 'refund_exceeds_credit' using errcode = 'P0001';
	end if;

	select coalesce(sum(a.amount_mad), 0) into v_to_adjusted from public.erp_invoice_adjustments a where a.invoice_id = v_to.id;
	select coalesce(sum(p.amount_mad), 0) into v_to_paid from public.erp_payments p where p.invoice_id = v_to.id;
	if v_to_paid + p_amount_mad > v_to.total_mad + v_to_adjusted then
		raise exception 'payment_exceeds_balance' using errcode = 'P0001';
	end if;

	insert into public.erp_invoice_adjustments (
		id, workspace_id, invoice_id, client_id, kind, amount_mad, description, idempotency_key, created_by
	) values (
		v_id, v_workspace_id, v_from.id, v_from.client_id, 'refund', p_amount_mad,
		'Credit applied to ' || v_to.document_number, p_idempotency_key, v_user_id
	);
	insert into public.erp_payments (
		id, workspace_id, invoice_id, amount_mad, payment_method, paid_at, reference, created_by, idempotency_key
	) values (
		gen_random_uuid(), v_workspace_id, v_to.id, p_amount_mad, 'other', now(),
		'Credit from ' || v_from.document_number, v_user_id, gen_random_uuid()
	);
	update public.erp_invoices set updated_at = now() where id in (v_from.id, v_to.id);
	return v_id;
end;
$$;

revoke all on function public.erp_apply_client_credit(uuid, uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.erp_apply_client_credit(uuid, uuid, numeric, uuid) to authenticated;
