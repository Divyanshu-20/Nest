"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Comment {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
}

interface Profile {
  id: string;
  username: string;
  avatar_path: string | null;
}

export default function CommentList({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [avatarSignedUrls, setAvatarSignedUrls] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    setComments((data as Comment[] | null) ?? []);
    
    // Load profiles for comment authors
    const userIds = [...new Set((data as Comment[] | null)?.map(c => c.user_id) ?? [])];
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, username, avatar_path")
        .in("id", userIds);
      
      const profileMap: Record<string, Profile> = {};
      ((profileData as Profile[] | null) ?? []).forEach(p => profileMap[p.id] = p);
      setProfiles(profileMap);
      
      // Load avatar signed URLs
      const avatarUrls: Record<string, string> = {};
      for (const profile of Object.values(profileMap)) {
        if (profile.avatar_path) {
          const { data: signedData } = await supabase.storage
            .from("avatars")
            .createSignedUrl(profile.avatar_path, 60 * 60);
          if (signedData?.signedUrl) {
            avatarUrls[profile.id] = signedData.signedUrl;
          }
        }
      }
      setAvatarSignedUrls(avatarUrls);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    load();

    const channel = supabase
      .channel(`comments-${postId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [postId]);

  const add = async () => {
    if (!me || !text.trim()) return;
    const { error } = await supabase.from("comments").insert({ post_id: postId, user_id: me, content: text.trim() });
    if (!error) setText("");
  };

  const remove = async (id: string) => {
    if (!me) return;
    if (!confirm("Delete this comment?")) return;
    setDeletingId(id);
    try {
      await supabase.from("comments").delete().eq("id", id);
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete comment");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-3 pl-12">
      {/* Comment Input */}
      <div className="flex gap-3 mb-4">
        <div className="w-8 h-8 bg-gray-800 rounded-full flex-shrink-0"></div>
        <div className="flex-1 flex gap-2">
          <input
            className="flex-1 bg-black border border-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-sky-500 outline-none"
            placeholder="Post your reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && add()}
          />
          <button 
            onClick={add}
            disabled={!text.trim()}
            className="bg-sky-500 hover:bg-sky-600 disabled:bg-sky-800 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-full transition-colors"
          >
            Reply
          </button>
        </div>
      </div>

      {/* Comments List */}
      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 py-2">
              <div className="flex-shrink-0">
                {avatarSignedUrls[c.user_id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSignedUrls[c.user_id]} alt="avatar" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-gray-800 rounded-full"></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">{profiles[c.user_id]?.username ?? 'User'}</span>
                    <span className="text-gray-400 text-xs">
                      {new Date(c.created_at).toLocaleDateString()} · {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {me === c.user_id && (
                    <button 
                      onClick={() => remove(c.id)} 
                      disabled={deletingId === c.id}
                      className="text-red-500 hover:text-red-400 text-xs font-medium px-2 py-1 rounded-full hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === c.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
                <p className="text-white text-sm leading-relaxed">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
