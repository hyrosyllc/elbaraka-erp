alter table public.erp_clients
	add column latitude numeric(9, 6),
	add column longitude numeric(9, 6),
	add constraint erp_clients_coordinates_valid_check
		check (
			(latitude is null and longitude is null)
			or (
				latitude is not null
				and longitude is not null
				and latitude between -90 and 90
				and longitude between -180 and 180
			)
		);