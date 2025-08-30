-- Complete likes table fix - Run this in Supabase SQL Editor

-- Drop the table completely and recreate
DROP TABLE IF EXISTS public.likes CASCADE;

-- Recreate likes table in public schema
CREATE TABLE public.likes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Create very simple policies that work
CREATE POLICY "Enable read access for authenticated users" ON public.likes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.likes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Enable delete for users based on user_id" ON public.likes
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_likes_post_id ON public.likes(post_id);
CREATE INDEX idx_likes_user_id ON public.likes(user_id);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;
