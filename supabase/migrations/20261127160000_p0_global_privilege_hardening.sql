-- P0 follow-up: remove bypass-RLS privileges from every existing public table
-- and harden default privileges for future database objects.
-- This migration changes ACLs only; it does not alter or delete user data.

REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

REVOKE UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  FROM anon, authenticated;

-- Current project migrations create objects as postgres or supabase_admin.
-- Remove dangerous table ACLs from future tables while preserving ordinary
-- SELECT/INSERT/UPDATE/DELETE grants where explicitly configured by defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- New functions must receive explicit EXECUTE grants. This prevents a future
-- SECURITY DEFINER RPC from becoming callable by every API role by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Keep USAGE on sequences for identity/serial inserts, but do not let API roles
-- call setval() and rewrite sequence state.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE UPDATE ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE UPDATE ON SEQUENCES FROM anon, authenticated;
