-- Fix likes table RLS policies
-- Run this in your Supabase SQL Editor

-- Drop existing likes policies
DROP POLICY IF EXISTS "likes_select_authenticated" ON public.likes;
DROP POLICY IF EXISTS "likes_insert_self" ON public.likes;
DROP POLICY IF EXISTS "likes_delete_self" ON public.likes;

-- Create simplified and working policies
CREATE POLICY "likes_select_all" ON public.likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "likes_insert_authenticated" ON public.likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "likes_delete_own" ON public.likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());
