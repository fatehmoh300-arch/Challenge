-- P0 follow-up: remove bypass-RLS privileges from every existing public table.
-- This migration changes ACLs only; it does not alter or delete user data.
--
-- The hosted migration role is not permitted to change default ACLs for the
-- postgres/supabase_admin owner roles. Existing objects are hardened here;
-- default ACLs are recorded as an operational limitation for future schema work.

REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

REVOKE UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  FROM anon, authenticated;

COMMENT ON SCHEMA public IS
  'API roles must not receive TRUNCATE, REFERENCES, TRIGGER or sequence UPDATE; review default ACLs for future tables/functions because hosted migration role cannot alter owner default privileges.';
