"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Profile { id: string; username: string; avatar_path: string | null }

export default function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarSigned, setAvatarSigned] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (!userId) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_path")
        .eq("id", userId)
        .single();
      setProfile(data as Profile | null);
    };
    if (userId) loadProfile();
  }, [userId]);

  useEffect(() => {
    const loadAvatar = async () => {
      if (!profile?.avatar_path) return setAvatarSigned(null);
      const { data } = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 60 * 60);
      setAvatarSigned(data?.signedUrl ?? null);
    };
    loadAvatar();
  }, [profile?.avatar_path]);

  const submit = async () => {
    if (!userId) return alert("Login required");
    if (!content && !file) return;
    setLoading(true);
    try {
      let image_path: string | null = null;
      if (file) {
        const path = `${userId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("post-images")
          .upload(path, file);
        if (upErr) throw upErr;
        image_path = path;
      }
      const { error: insErr } = await supabase.from("posts").insert({
        author_id: userId,
        content: content || null,
        image_path,
      });
      if (insErr) throw insErr;
      setContent("");
      setFile(null);
      onPosted?.();
    } catch (e: any) {
      alert(e.message ?? "Failed to post");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          {avatarSigned ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSigned} alt="avatar" className="w-12 h-12 rounded-full" />
          ) : (
            <div className="w-12 h-12 bg-gray-800 rounded-full"></div>
          )}
        </div>
        <div className="flex-1">
          <textarea
            className="w-full bg-black border border-gray-800 rounded-lg p-3 text-white placeholder-gray-500 text-xl resize-none focus:border-sky-500 outline-none"
            rows={3}
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center justify-between mt-3">
            <input 
              type="file" 
              accept="image/*" 
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-sky-500 file:text-white file:cursor-pointer hover:file:bg-sky-600"
            />
            <button 
              onClick={submit} 
              disabled={loading || (!content && !file)}
              className="bg-sky-500 hover:bg-sky-600 disabled:bg-sky-800 disabled:opacity-50 text-white font-semibold py-2 px-8 rounded-full transition-colors"
            >
              {loading ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
