-- =============================================================================
-- Migration: Add profile_pic_url column to public.profiles table and setup storage
-- =============================================================================

-- 1. Add profile_pic_url column if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'profile_pic_url'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN profile_pic_url TEXT DEFAULT NULL;
    END IF;
END $$;

-- 2. Create 'Images' bucket in storage if not existing
INSERT INTO storage.buckets (id, name, public)
VALUES ('Images', 'Images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Storage Policies for 'Images' bucket (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Public can view images in Images bucket" ON storage.objects;
CREATE POLICY "Public can view images in Images bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'Images');

DROP POLICY IF EXISTS "Authenticated users can upload images to Images bucket" ON storage.objects;
CREATE POLICY "Authenticated users can upload images to Images bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'Images');

DROP POLICY IF EXISTS "Users can update their uploaded images in Images bucket" ON storage.objects;
CREATE POLICY "Users can update their uploaded images in Images bucket"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'Images')
WITH CHECK (bucket_id = 'Images');

DROP POLICY IF EXISTS "Users can delete their uploaded images in Images bucket" ON storage.objects;
CREATE POLICY "Users can delete their uploaded images in Images bucket"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'Images');

-- 4. Enable RLS on storage.objects if not already enabled (managed by Supabase)
