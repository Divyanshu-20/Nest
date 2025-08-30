"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CommentList from "@/components/CommentList";

interface PostRow {
  id: string;
  author_id: string;
  content: string | null;
  image_path: string | null;
  created_at: string;
}

interface ProfileRow { id: string; username: string; avatar_path: string | null }

export default function PostItem({ post }: { post: PostRow }) {
  const [author, setAuthor] = useState<ProfileRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const loadAuthor = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_path")
      .eq("id", post.author_id)
      .single();
    const a = data as ProfileRow | null;
    if (a) setAuthor(a);
  };

  const loadCounts = async () => {
    const comments = await supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", post.id);
    setCommentCount(comments.count ?? 0);
  };

  const loadImage = async () => {
    if (!post.image_path) return setImageUrl(null);
    const { data, error } = await supabase.storage
      .from("post-images")
      .createSignedUrl(post.image_path, 60 * 60);
    if (!error && data?.signedUrl) setImageUrl(data.signedUrl);
  };

  useEffect(() => {
    loadAuthor();
    loadCounts();
    loadImage();
    const ch = supabase
      .channel(`post-${post.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` }, loadCounts)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` }, loadCounts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [post.id, me]);

  const [deleting, setDeleting] = useState(false);
  const deletePost = async () => {
    if (!me || me !== post.author_id) return;
    if (!confirm("Delete this post?")) return;
    setDeleting(true);
    try {
      if (post.image_path) {
        await supabase.storage.from("post-images").remove([post.image_path]);
      }
      await supabase.from("posts").delete().eq("id", post.id);
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete post");
    } finally {
      setDeleting(false);
    }
  };

  const avatarUrl = useMemo(() => author?.avatar_path || null, [author]);

  const [avatarSigned, setAvatarSigned] = useState<string | null>(null);
  useEffect(() => {
    const loadAvatar = async () => {
      if (!avatarUrl) return setAvatarSigned(null);
      const { data } = await supabase.storage.from("avatars").createSignedUrl(avatarUrl, 60 * 60);
      setAvatarSigned(data?.signedUrl ?? null);
    };
    loadAvatar();
  }, [avatarUrl]);

  return (
    <div className="border-b border-gray-800 px-2 md:px-4 py-4 md:py-6">
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {avatarSigned ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSigned} alt="avatar" className="w-10 h-10 md:w-12 md:h-12 rounded-full" />
            ) : (
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-800 rounded-full" />
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm md:text-base">{author?.username ?? "Unknown"}</span>
                <span className="text-gray-400 text-xs md:text-sm">
                  {new Date(post.created_at).toLocaleDateString()}
                </span>
              </div>
              
              {/* Delete button for own posts */}
              {me === post.author_id && (
                <button 
                  onClick={deletePost}
                  disabled={deleting}
                  className="px-2 md:px-3 py-1 text-xs md:text-sm bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
            
            {/* Post content */}
            <p className="text-white mb-3 whitespace-pre-wrap break-words text-sm md:text-base">{post.content}</p>
            
            {/* Image */}
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={imageUrl} 
                alt="post image" 
                className="rounded-2xl max-w-full border border-gray-800 mb-3"
              />
            )}
            
            {/* Actions */}
            <div className="flex items-center gap-4 md:gap-6 mt-3">
              <span className="flex items-center gap-2 text-xs md:text-sm text-gray-400">
                <div className="p-1 md:p-2 rounded-full">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="md:w-[18px] md:h-[18px]">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <span>{commentCount} comments</span>
              </span>
            </div>
          </div>
        </div>
      
      {/* Comments */}
      <div className="mt-4">
        <CommentList postId={post.id} />
      </div>
    </div>
  );
}
