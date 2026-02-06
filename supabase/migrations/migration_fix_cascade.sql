-- Migration to add ON DELETE CASCADE to shared_links table
-- This fixes the issue where deleting a file fails if it has shared links.

BEGIN;

-- 1. Drop existing foreign key constraint
-- Note: PostgreSQL default naming convention is usually table_column_fkey
ALTER TABLE public.shared_links
DROP CONSTRAINT IF EXISTS shared_links_file_id_fkey;

-- 2. Add the constraint back with ON DELETE CASCADE
ALTER TABLE public.shared_links
ADD CONSTRAINT shared_links_file_id_fkey
FOREIGN KEY (file_id)
REFERENCES public.files(id)
ON DELETE CASCADE;

COMMIT;
