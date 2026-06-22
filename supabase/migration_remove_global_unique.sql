-- ============================================================
-- MIGRATION: Allow duplicate LOT numbers
-- Run this in Supabase Dashboard -> SQL Editor
-- ============================================================

-- Drop the global unique constraint on yarn_code to allow identical LOT codes
ALTER TABLE public.yarn_rolls DROP CONSTRAINT IF EXISTS yarn_rolls_yarn_code_key;
