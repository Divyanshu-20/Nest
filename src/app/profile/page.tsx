"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface Profile { id: string; username: string; bio: string | null; avatar_path: string | null }

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSigned, setAvatarSigned] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setMe(data.session.user.id);
    });
  }, [router]);

  const load = async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, bio, avatar_path")
      .eq("id", uid)
      .single();
    const p = data as Profile | null;
    if (p) {
      setProfile(p);
      setUsername(p.username ?? "");
      setBio(p.bio ?? "");
      setAvatarUrl(p.avatar_path ?? null);
    }
  };

  useEffect(() => { if (me) load(me); }, [me]);

  useEffect(() => {
    const loadSigned = async () => {
      if (!avatarUrl) return setAvatarSigned(null);
      const { data } = await supabase.storage.from("avatars").createSignedUrl(avatarUrl, 60 * 60);
      setAvatarSigned(data?.signedUrl ?? null);
    };
    loadSigned();
  }, [avatarUrl]);

  const save = async () => {
    if (!me) return;
    await supabase.from("profiles").update({ username, bio }).eq("id", me);
    await load(me);
  };

  const uploadAvatar = async (file: File) => {
    if (!me) return;
    const path = `${me}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file);
    if (error) return alert(error.message);
    await supabase.from("profiles").update({ avatar_path: path }).eq("id", me);
    setAvatarUrl(path);
  };

  if (!me) return null;

  return (
    <div className="max-w-2xl mx-auto px-2 md:px-4 py-4 md:py-8">
      {/* Profile Header */}
      <div className="border-b border-gray-800 p-3 md:p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Edit Profile</h1>
        
        {/* Avatar Section */}
        <div className="flex items-start gap-4 mb-6">
          <div className="relative">
            {avatarSigned ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSigned} alt="avatar" className="w-24 h-24 rounded-full border-4 border-gray-800" />
            ) : (
              <div className="w-24 h-24 bg-gray-800 rounded-full border-4 border-gray-700" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white mb-2">{username || "Your Name"}</h2>
            <label className="inline-block bg-black border border-gray-800 hover:border-sky-500 text-sky-500 hover:bg-gray-950 px-4 py-2 rounded-full cursor-pointer transition-colors">
              <span className="text-sm font-medium">Change Photo</span>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar(f);
                }} 
              />
            </label>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm font-medium mb-2">Username</label>
            <input 
              className="w-full bg-black border border-gray-800 rounded-lg p-3 text-white placeholder-gray-500 focus:border-sky-500 outline-none"
              placeholder="Your username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
            />
          </div>
          
          <div>
            <label className="block text-gray-400 text-sm font-medium mb-2">Bio</label>
            <textarea 
              className="w-full bg-black border border-gray-800 rounded-lg p-3 text-white placeholder-gray-500 focus:border-sky-500 outline-none resize-none"
              rows={4} 
              placeholder="Tell us about yourself..." 
              value={bio} 
              onChange={(e) => setBio(e.target.value)} 
            />
          </div>
          
          <div className="flex justify-end pt-4">
            <button 
              onClick={save}
              className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-8 rounded-full transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
