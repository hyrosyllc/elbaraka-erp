create schema if not exists erp_private;
revoke all on schema erp_private from public, anon, authenticated;

-- Fixed slots bound table growth without retaining IP addresses or user IDs.
create table erp_private.api_rate_limit_buckets (
	scope text not null check (scope in (
		'admin_users_list',
		'admin_users_create',
		'admin_users_update',
		'admin_customer_invite',
		'customer_account',
		'customer_catalog',
		'customer_invite_validation',
		'customer_order',
		'customer_profile',
		'operations_inventory_setup',
		'operations_orders'
	)),
	bucket smallint not null check (bucket between 0 and 32767),
	window_started_at timestamptz not null,
	request_count integer not null check (request_count > 0),
	primary key (scope, bucket)
);

alter table erp_private.api_rate_limit_buckets enable row level security;
revoke all on table erp_private.api_rate_limit_buckets from public, anon, authenticated, service_role;

create or replace function public.erp_check_api_rate_limit(
	p_scope text,
	p_bucket integer,
	p_limit integer,
	p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_now timestamptz := clock_timestamp();
	v_count integer;
begin
	if p_scope is null
		or p_bucket is null or p_bucket not between 0 and 32767
		or p_limit is null or p_limit < 1 or p_limit > 1000
		or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
		raise exception using errcode = '22023', message = 'invalid_rate_limit_parameters';
	end if;

	insert into erp_private.api_rate_limit_buckets (
		scope, bucket, window_started_at, request_count
	)
	values (p_scope, p_bucket, v_now, 1)
	on conflict (scope, bucket) do update
	set window_started_at = case
			when erp_private.api_rate_limit_buckets.window_started_at
				<= v_now - make_interval(secs => p_window_seconds::double precision)
			then v_now
			else erp_private.api_rate_limit_buckets.window_started_at
		end,
		request_count = case
			when erp_private.api_rate_limit_buckets.window_started_at
				<= v_now - make_interval(secs => p_window_seconds::double precision)
			then 1
			else least(p_limit + 1, erp_private.api_rate_limit_buckets.request_count + 1)
		end
	returning request_count into v_count;

	return v_count <= p_limit;
end;
$$;

revoke all on function public.erp_check_api_rate_limit(text, integer, integer, integer)
	from public, anon, authenticated;
grant execute on function public.erp_check_api_rate_limit(text, integer, integer, integer)
	to service_role;