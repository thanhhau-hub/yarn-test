-- ============================================================
-- YARN TRACKER MIGRATION: Guest Data Access & Worker Role Reversion
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

BEGIN;

-- 1. Revert 'user' back to 'worker' and drop status
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE public.profiles SET role = 'worker' WHERE role = 'user';

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('worker', 'supervisor', 'admin'));
ALTER TABLE public.profiles DROP COLUMN IF EXISTS status;

-- 2. Allow anonymous access (guests) to read data
-- Guests need read access because they are not authenticated.

-- Areas
DROP POLICY IF EXISTS "areas_select_authenticated" ON public.areas;
DROP POLICY IF EXISTS "areas_select_public" ON public.areas;
CREATE POLICY "areas_select_public" ON public.areas FOR SELECT USING (true);

-- Yarn Rolls
DROP POLICY IF EXISTS "yarn_rolls_select_authenticated" ON public.yarn_rolls;
DROP POLICY IF EXISTS "yarn_rolls_select_public" ON public.yarn_rolls;
CREATE POLICY "yarn_rolls_select_public" ON public.yarn_rolls FOR SELECT USING (true);

-- Move Logs
DROP POLICY IF EXISTS "move_logs_select_authenticated" ON public.move_logs;
DROP POLICY IF EXISTS "move_logs_select_public" ON public.move_logs;
CREATE POLICY "move_logs_select_public" ON public.move_logs FOR SELECT USING (true);

COMMIT;
