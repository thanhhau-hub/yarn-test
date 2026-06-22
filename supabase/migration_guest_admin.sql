-- ============================================================
-- YARN TRACKER MIGRATION: Guest, Admin Roles, Search Fields & Constraints
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

BEGIN;

-- 1. Add color and description to yarn_rolls
ALTER TABLE public.yarn_rolls ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.yarn_rolls ADD COLUMN IF NOT EXISTS description text;

-- 2. Update profiles check constraints to allow 'admin' and 'user'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'supervisor', 'admin'));

-- 3. Location deletion rule (cannot delete if it has yarn rolls)
CREATE OR REPLACE FUNCTION public.check_area_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if there are any yarn rolls currently in this area
  IF EXISTS (SELECT 1 FROM public.yarn_rolls WHERE area_id = OLD.id) THEN
    RAISE EXCEPTION 'Location can only be deleted when it contains zero yarn rolls.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_area_deletion ON public.areas;
CREATE TRIGGER trg_check_area_deletion
BEFORE DELETE ON public.areas
FOR EACH ROW EXECUTE FUNCTION public.check_area_deletion();

-- 4. Location name duplicate protection
-- The 'areas.code' column already has a UNIQUE constraint from setup.sql.

-- 5. Admin protection constraints
CREATE OR REPLACE FUNCTION public.check_admin_protections()
RETURNS TRIGGER AS $$
DECLARE
  admin_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Cannot delete self
    IF OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'Admin cannot delete themselves.';
    END IF;
    
    -- Cannot delete the last admin
    IF OLD.role = 'admin' THEN
      SELECT count(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
      IF admin_count <= 1 THEN
        RAISE EXCEPTION 'Cannot delete the last Admin.';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Cannot demote the last admin
    IF OLD.role = 'admin' AND NEW.role != 'admin' THEN
      SELECT count(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
      IF admin_count <= 1 THEN
        RAISE EXCEPTION 'Cannot demote the last Admin.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_admin_protections ON public.profiles;
CREATE TRIGGER trg_check_admin_protections
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_admin_protections();

-- 6. Helper functions for permissions
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('supervisor', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 7. Update RLS on Profiles to let admins manage accounts
DROP POLICY IF EXISTS "profiles_update_supervisor" ON public.profiles;
CREATE POLICY "profiles_update_supervisor"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR (public.is_supervisor() AND id = auth.uid()))
  WITH CHECK (public.is_admin() OR (public.is_supervisor() AND id = auth.uid()));

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

COMMIT;
