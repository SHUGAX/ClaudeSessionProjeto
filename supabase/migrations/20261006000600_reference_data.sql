-- Reference data: default plan templates. Commercial prices are agreed outside
-- the system; plans only carry limits/feature flags. Platform administrators can
-- override any limit per organization.
insert into public.plans (code, name, monthly_document_limit, monthly_ai_limit, user_limit, storage_limit_bytes, features)
values
  ('trial', 'Experimental', 50, 50, 3, 1073741824, '{"assistant": false}'::jsonb),
  ('standard', 'Standard', 500, 500, 10, 10737418240, '{"assistant": false}'::jsonb),
  ('business', 'Business', 3000, 3000, 50, 53687091200, '{"assistant": true}'::jsonb),
  ('enterprise', 'Enterprise', null, null, null, null, '{"assistant": true}'::jsonb)
on conflict (code) do nothing;
