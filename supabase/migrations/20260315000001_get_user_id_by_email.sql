-- Helper function: look up a user UUID by email from auth.users.
-- Used by the magic link auth route to avoid auth.admin.listUsers()
-- which is unreliable on free-tier Supabase projects.
CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_user_id_by_email(TEXT) TO service_role;
