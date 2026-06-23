-- 0156: Merge the separate admin fee + print fee into ONE "Admin & print fee".
-- The combined value lives in the admin_fee key; print_fee is cleared. This is
-- backward-compatible: the old frontend computes admin_fee + coalesce(print_fee,0)
-- = the combined value, while the new frontend reads only admin_fee.
do $$
declare v_adm numeric; v_prt numeric;
begin
  select value into v_adm from public.pricing_settings where key = 'admin_fee';
  select value into v_prt from public.pricing_settings where key = 'print_fee';
  update public.pricing_settings
     set value = case when v_adm is null and v_prt is null then null
                      else coalesce(v_adm, 0) + coalesce(v_prt, 0) end,
         label = 'Admin & print fee'
   where key = 'admin_fee';
  update public.pricing_settings set value = null where key = 'print_fee';
end $$;
