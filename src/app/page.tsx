"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PostComposer from "@/components/PostComposer";
import PostItem from "@/components/PostItem";

interface PostRow { id: string; author_id: string; content: string | null; image_path: string | null; created_at: string }

export default function FeedPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [posts, setPosts] = useState<PostRow[]>([]);

  const load = async () => {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setPosts((data as PostRow[] | null) ?? []);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    load();
    const ch = supabase
      .channel("feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="max-w-2xl mx-auto px-2 md:px-4 py-4 md:py-8">
      <div className="border-b border-gray-800 p-2 md:p-4">
        <PostComposer onPosted={() => load()} />
      </div>
      <div>
        {posts.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No posts yet. Add friends and share something!</p>
        ) : (
          posts.map((post) => <PostItem key={post.id} post={post} />)
        )}
      </div>
    </div>
  );
}
