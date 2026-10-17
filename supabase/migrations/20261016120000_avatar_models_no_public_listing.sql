-- =============================================================================
-- avatar-models is a public bucket: public object URLs work without any SELECT policy on
-- storage.objects, so the broad policy only let clients list every file. Drop it; admins keep listing.
-- Face / outfit GLBs are served from this bucket (see scripts/upload-avatar-models.mjs).
-- =============================================================================
DROP POLICY IF EXISTS "Public can view avatar models" ON storage.objects;

DROP POLICY IF EXISTS "Admins can list avatar models" ON storage.objects;
CREATE POLICY "Admins can list avatar models"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatar-models' AND (select public.is_admin()));
