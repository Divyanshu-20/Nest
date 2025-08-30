-- Clean up and rebuild likes table to fix duplicate key issues
DROP TABLE IF EXISTS public.likes CASCADE;

-- Recreate likes table with proper constraints
CREATE TABLE public.likes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "likes_select_authenticated" ON public.likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "likes_insert_self" ON public.likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "likes_delete_self" ON public.likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX idx_likes_post_id ON public.likes(post_id);
CREATE INDEX idx_likes_user_id ON public.likes(user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;
