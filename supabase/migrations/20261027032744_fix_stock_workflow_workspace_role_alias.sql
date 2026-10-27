do $$
declare
	v_function record;
	v_definition text;
	v_replaced_count integer := 0;
begin
	for v_function in
		select p.oid
		from pg_catalog.pg_proc p
		join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.proname in (
				'erp_create_inventory_item',
				'erp_create_inventory_location',
				'erp_create_purchase_order',
				'erp_mark_purchase_order_ordered',
				'erp_cancel_purchase_order',
				'erp_receive_purchase_order',
				'erp_create_inventory_transfer',
				'erp_request_inventory_adjustment',
				'erp_review_inventory_adjustment'
			)
			and p.prosrc ~* 'from erp_private[.]erp_require_workspace_role'
	loop
		v_definition := pg_catalog.pg_get_functiondef(v_function.oid);
		v_definition := pg_catalog.regexp_replace(
			v_definition,
			'(from erp_private[.]erp_require_workspace_role\([^)]*\))([[:space:]]*;)',
			'\1 as r\2',
			'gi'
		);
		execute v_definition;
		v_replaced_count := v_replaced_count + 1;
	end loop;

	if v_replaced_count <> 9 then
		raise exception 'Expected to fix 9 stock workflow role checks, fixed %', v_replaced_count;
	end if;
end;
$$;