-- Deletes only the client-experience fixtures tagged UXDEMO in the explicitly
-- selected real workspace. Replace the UUID with the same workspace UUID used
-- by client_experience_seed.sql, then run this script manually.
--
-- Inventory movements and fake auth users are never created by the seed.
-- If you add other records that reference these fixtures, PostgreSQL will
-- reject the cleanup rather than deleting unrelated data.

begin;

do $$
declare
	v_workspace_id uuid := 'e0000000-0000-4000-8000-000000000001'::uuid;
begin
	if not exists (
		select 1 from public.erp_workspaces w
		where w.id = v_workspace_id and not w.is_demo
	) then
		raise exception 'Workspace not found or is the prebuilt demo workspace. Verify the cleanup UUID.';
	end if;
	if exists (
		select 1
		from public.erp_customer_memberships m
		join public.erp_clients c
			on c.workspace_id = m.workspace_id and c.id = m.client_id
		where m.workspace_id = v_workspace_id
			and c.code like 'UXDEMO-C-%'
	) then
		raise exception 'Demo clients have customer memberships. Remove those test memberships explicitly; this script never deletes Auth users.';
	end if;
	if exists (
		select 1
		from public.inventory_movements m
		join public.inventory_items i on i.id = m.item_id
		where m.workspace_id = v_workspace_id
			and i.workspace_id = v_workspace_id
			and i.sku like 'UXDEMO-FG-' || upper(substr(md5(v_workspace_id::text), 1, 8)) || '-%'
	) then
		raise exception 'Demo inventory has ledger movements and cannot be safely deleted. Resolve those movements through the inventory workflow first.';
	end if;

	delete from public.erp_return_dispositions
	where workspace_id = v_workspace_id
		and return_id in (
			select r.id from public.erp_customer_returns r
			where r.workspace_id = v_workspace_id
				and r.document_number like 'UXDEMO-RET-%'
		);

	delete from public.erp_customer_return_lines l
	where l.workspace_id = v_workspace_id
		and l.return_id in (
			select r.id from public.erp_customer_returns r
			where r.workspace_id = v_workspace_id
				and r.document_number like 'UXDEMO-RET-%'
		);

	delete from public.erp_customer_returns
	where workspace_id = v_workspace_id
		and document_number like 'UXDEMO-RET-%';

	delete from public.erp_client_notes
	where workspace_id = v_workspace_id
		and client_id in (
			select c.id from public.erp_clients c
			where c.workspace_id = v_workspace_id and c.code like 'UXDEMO-C-%'
		);

	delete from public.erp_customer_invites
	where workspace_id = v_workspace_id
		and client_id in (
			select c.id from public.erp_clients c
			where c.workspace_id = v_workspace_id and c.code like 'UXDEMO-C-%'
		);

	delete from public.erp_external_returns
	where workspace_id = v_workspace_id
		and invoice_id in (
			select i.id from public.erp_invoices i
			where i.workspace_id = v_workspace_id
				and i.document_number like 'UXDEMO-INV-%'
		);

	delete from public.erp_invoice_adjustments
	where workspace_id = v_workspace_id
		and invoice_id in (
			select i.id from public.erp_invoices i
			where i.workspace_id = v_workspace_id
				and i.document_number like 'UXDEMO-INV-%'
		);

	delete from public.erp_payments
	where workspace_id = v_workspace_id
		and invoice_id in (
			select i.id from public.erp_invoices i
			where i.workspace_id = v_workspace_id
				and i.document_number like 'UXDEMO-INV-%'
		);

	delete from public.erp_invoices
	where workspace_id = v_workspace_id
		and document_number like 'UXDEMO-INV-%';

	delete from public.erp_delivery_note_lines
	where workspace_id = v_workspace_id
		and delivery_note_id in (
			select d.id from public.erp_delivery_notes d
			where d.workspace_id = v_workspace_id
				and d.document_number like 'UXDEMO-DN-%'
		);

	delete from public.erp_delivery_notes
	where workspace_id = v_workspace_id
		and document_number like 'UXDEMO-DN-%';

	delete from public.erp_sales_order_lines
	where workspace_id = v_workspace_id
		and order_id in (
			select o.id from public.erp_sales_orders o
			where o.workspace_id = v_workspace_id
				and o.document_number like 'UXDEMO-SO-%'
		);

	delete from public.erp_sales_orders
	where workspace_id = v_workspace_id
		and document_number like 'UXDEMO-SO-%';

	delete from public.erp_clients
	where workspace_id = v_workspace_id and code like 'UXDEMO-C-%';

	delete from public.erp_product_sizes
	where workspace_id = v_workspace_id
		and sku like 'UXDEMO-FG-' || upper(substr(md5(v_workspace_id::text), 1, 8)) || '-%';

	delete from public.erp_products
	where workspace_id = v_workspace_id
		and name like 'UXDEMO %';

	delete from public.erp_product_categories
	where workspace_id = v_workspace_id
		and name like 'UXDEMO %';

	delete from public.inventory_items
	where workspace_id = v_workspace_id
		and sku like 'UXDEMO-FG-' || upper(substr(md5(v_workspace_id::text), 1, 8)) || '-%';
end;
$$;

commit;
