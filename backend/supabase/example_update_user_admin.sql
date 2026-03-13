-- Example SQL to update a specific user to admin in Supabase.
-- Replace 'YOUR_USER_ID_HERE' with the actual user UUID (e.g., from auth.users.id).
-- Run this in Supabase SQL Editor.

UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin", "is_admin": true}'
WHERE id = 'YOUR_USER_ID_HERE';

-- Verify the update:
-- SELECT id, email, raw_app_meta_data FROM auth.users WHERE id = 'YOUR_USER_ID_HERE';