-- =============================================================================
-- Storage.
--
-- "documents": PRIVATE bucket holding original business documents.
--   Path: organizations/{organization_id}/documents/{document_id}/original.{ext}
--   Read: active members of the organization (signed URLs are generated with the
--         user's own session, so this policy is enforced for every view).
--   Write: service role only (uploads use short-lived signed upload URLs issued by
--          the server after authorization; the server then verifies the bytes).
--
-- "organization-logos": PUBLIC bucket for tenant logos shown on login pages.
--   Logos are not confidential. Writes: service role only.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400, -- 25 MiB; keep in sync with MAX_UPLOAD_BYTES in src/lib/documents/file-types.ts
  array['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organization-logos', 'organization-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy documents_bucket_select_members on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'organizations'
    and public.try_uuid((storage.foldername(name))[2]) in (select public.user_org_ids())
  );

-- No insert/update/delete policies for end users on the documents bucket:
-- originals are immutable from the user's point of view.
