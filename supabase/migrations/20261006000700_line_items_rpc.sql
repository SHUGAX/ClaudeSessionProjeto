-- Replaces all line items of a document atomically (single transaction).
-- SECURITY INVOKER: RLS policies on document_line_items apply to the caller.
create or replace function public.replace_document_line_items(p_document_id uuid, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'Invalid line items payload' using errcode = '22023';
  end if;

  select organization_id into v_org from public.documents where id = p_document_id;
  if v_org is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  delete from public.document_line_items where document_id = p_document_id;

  insert into public.document_line_items
    (organization_id, document_id, position, description, quantity, unit_price, tax_rate, tax_amount, line_total)
  select v_org,
         p_document_id,
         (item.ordinality - 1)::integer,
         left(item.value ->> 'description', 1000),
         nullif(item.value ->> 'quantity', '')::numeric,
         nullif(item.value ->> 'unit_price', '')::numeric,
         nullif(item.value ->> 'tax_rate', '')::numeric,
         nullif(item.value ->> 'tax_amount', '')::numeric,
         nullif(item.value ->> 'line_total', '')::numeric
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_document_line_items(uuid, jsonb) from public, anon;
grant execute on function public.replace_document_line_items(uuid, jsonb) to authenticated, service_role;
