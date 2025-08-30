-- Fix likes table and policies
DROP TABLE IF EXISTS public.likes CASCADE;

CREATE TABLE public.likes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "likes_select_authenticated" ON public.likes;
DROP POLICY IF EXISTS "likes_insert_self" ON public.likes;
DROP POLICY IF EXISTS "likes_delete_self" ON public.likes;

-- Simplified policies for better performance
CREATE POLICY "likes_select_authenticated" ON public.likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "likes_insert_self" ON public.likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "likes_delete_self" ON public.likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);

-- Add to realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;
  END IF;
END
$$;
