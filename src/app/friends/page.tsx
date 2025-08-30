"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface Profile { id: string; username: string; avatar_path?: string | null }
interface Friendship { id: string; requester_id: string; addressee_id: string; status: string; created_at: string }

export default function FriendsPage() {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);

  const [incoming, setIncoming] = useState<Friendship[]>([]);
  const [feedback, setFeedback] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | undefined>>({});
  const [sent, setSent] = useState<Friendship[]>([]);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [showIncoming, setShowIncoming] = useState(true);
  const [showSent, setShowSent] = useState(true);
  const [showFriends, setShowFriends] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setMe(data.session.user.id);
    });
  }, [router]);

  const loadLists = useCallback(async () => {
    if (!me) return;
    console.log('Loading friendship lists for user:', me);
    
    try {
      setLoading(true);
      const [friendsData, incomingData, sentData] = await Promise.all([
        supabase
          .from("friendships")
          .select("*")
          .eq("status", "accepted")
          .or(`requester_id.eq.${me},addressee_id.eq.${me}`),
        supabase.from("friendships").select("*").eq("addressee_id", me).eq("status", "pending"),
        supabase.from("friendships").select("*").eq("requester_id", me).eq("status", "pending"),
      ]);
      
      console.log('Friends data:', friendsData);
      console.log('Incoming data:', incomingData);
      console.log('Sent data:', sentData);
      
      if (friendsData.error) console.error('Friends error:', friendsData.error);
      if (incomingData.error) console.error('Incoming error:', incomingData.error);
      if (sentData.error) console.error('Sent error:', sentData.error);
      
      setFriends((friendsData.data as any) ?? []);
      setIncoming((incomingData.data as any) ?? []);
      setSent((sentData.data as any) ?? []);

      // Load profiles for incoming, sent, and accepted friends
      const requesterIds = ((incomingData.data as any) ?? []).map((r: any) => r.requester_id).filter(Boolean);
      const addresseeIds = ((sentData.data as any) ?? []).map((r: any) => r.addressee_id).filter(Boolean);
      const friendOtherIds = ((friendsData.data as any) ?? [])
        .map((r: any) => (r.requester_id === me ? r.addressee_id : r.requester_id))
        .filter(Boolean);
      const allUserIds = [...new Set([...requesterIds, ...addresseeIds, ...friendOtherIds])];
      
      if (allUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username, avatar_path")
          .in("id", allUserIds);
        const profilesMap = (profilesData ?? []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p }), {});
        setProfiles(profilesMap);
        
        // Load avatars
        const avatarPromises = (profilesData ?? []).map(async (profile: any) => {
          if (profile.avatar_path) {
            const { data } = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 60 * 60);
            return { id: profile.id, url: data?.signedUrl };
          }
          return { id: profile.id, url: null };
        });
        
        const avatarResults = await Promise.all(avatarPromises);
        const avatarsMap = avatarResults.reduce((acc: any, { id, url }) => ({ ...acc, [id]: url ?? undefined }), {});
        setAvatars(avatarsMap);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading friendship lists:', error);
      setFeedback({ message: 'Failed to load friends list', type: 'error' });
      setTimeout(() => setFeedback(null), 3000);
      setLoading(false);
    }
  }, [me]);

  useEffect(() => { 
    if (me) { 
      loadLists(); 
      const ch = supabase
        .channel("friendships-me")
        .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, loadLists)
        .subscribe();
      return () => { supabase.removeChannel(ch); }; 
    } 
  }, [me, loadLists]);

  const search = async () => {
    if (!query.trim()) return setResults([]);
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_path")
      .ilike("username", `%${query.trim()}%`)
      .limit(10);
    const found = ((data as Profile[] | null) ?? []).filter((u) => u.id !== me);
    setResults(found);

    // Load avatars for results
    for (const u of found) {
      if (u.avatar_path) {
        const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(u.avatar_path, 60 * 60);
        if (signed?.signedUrl) {
          setAvatars(prev => ({ ...prev, [u.id]: signed.signedUrl }));
        }
      }
    }
  };

  const sendRequest = async (otherId: string) => {
    if (!me || otherId === me) return;
    
    try {
      console.log('Checking existing friendship with:', otherId);
      
      // Check if friendship already exists
      const { data: existing } = await supabase
        .from("friendships")
        .select("status")
        .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`)
        .maybeSingle();
      
      if (existing) {
        const status = existing.status;
        if (status === 'accepted') {
          setFeedback({ message: 'You are already friends with this user', type: 'info' });
        } else if (status === 'pending') {
          setFeedback({ message: 'Friend request already sent or pending', type: 'info' });
        } else {
          setFeedback({ message: 'Previous friendship request exists', type: 'info' });
        }
        setResults(prev => prev.filter(u => u.id !== otherId));
        setTimeout(() => setFeedback(null), 3000);
        return;
      }
      
      console.log('Sending friend request to:', otherId);
      const { error } = await supabase.from("friendships").insert({ 
        requester_id: me, 
        addressee_id: otherId, 
        status: "pending" 
      });
      
      if (error) {
        console.error('Error sending friend request:', error);
        setFeedback({ message: 'Failed to send friend request: ' + error.message, type: 'error' });
        setTimeout(() => setFeedback(null), 3000);
        return;
      }
      
      console.log('Friend request sent successfully');
      setFeedback({ message: 'Friend request sent!', type: 'success' });
      await loadLists();
      setTimeout(() => setFeedback(null), 3000);
      
      // Remove the user from search results after sending request
      setResults(prev => prev.filter(u => u.id !== otherId));
    } catch (error) {
      console.error('Unexpected error:', error);
      setFeedback({ message: 'Failed to send friend request', type: 'error' });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const acceptRequest = async (id: string) => {
    try {
      const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
      if (error) {
        setFeedback({ message: 'Failed to accept request: ' + error.message, type: 'error' });
      } else {
        setFeedback({ message: 'Friend request accepted!', type: 'success' });
        await loadLists();
      }
    } catch (error) {
      setFeedback({ message: 'Failed to accept request', type: 'error' });
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const rejectRequest = async (id: string) => {
    try {
      const { error } = await supabase.from("friendships").delete().eq("id", id);
      if (error) {
        setFeedback({ message: 'Failed to reject request: ' + error.message, type: 'error' });
      } else {
        setFeedback({ message: 'Friend request rejected', type: 'info' });
        await loadLists();
      }
    } catch (error) {
      setFeedback({ message: 'Failed to reject request', type: 'error' });
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const unfriend = async (otherId: string) => {
    if (!me) return;
    await supabase
      .from("friendships")
      .delete()
      .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`)
      .eq("status", "accepted");
    await loadLists();
  };

  if (!me) return null;

  return (
    <div className="max-w-2xl mx-auto px-2 md:px-4 py-4 md:py-8">
      {/* Header */}
      <div className="border-b border-gray-800 p-3 md:p-4">
        <h1 className="text-2xl font-bold text-white">Connect</h1>
      </div>

      {/* Search Section */}
      <div className="border-b border-gray-800 p-4">
        <div className="flex gap-3">
          <input 
            className="flex-1 bg-black border border-gray-800 rounded-full px-4 py-2 text-white placeholder-gray-500 focus:border-sky-500 outline-none focus:ring-2 focus:ring-sky-500/30"
            placeholder="Search for friends" 
            value={query} 
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button 
            onClick={search}
            className="bg-sky-500 hover:bg-sky-600 active:scale-95 text-white font-medium px-6 py-2 rounded-full transition-all shadow-sm hover:shadow-md shadow-sky-500/20"
          >
            Search
          </button>
        </div>
        
        {/* Feedback Message */}
        {feedback && (
          <div className={`mt-4 p-3 rounded-lg border ${
            feedback.type === 'success' ? 'bg-green-900/20 border-green-500 text-green-400' :
            feedback.type === 'error' ? 'bg-red-900/20 border-red-500 text-red-400' :
            'bg-blue-900/20 border-blue-500 text-blue-400'
          }`}>
            {feedback.message}
          </div>
        )}
        
        {/* Search Results */}
        {results.length > 0 && (
          <div className="mt-4 space-y-3 fade-in-up">
            {results.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-3 hover:bg-gray-950 rounded-lg transition-all duration-200 hover:translate-y-[-1px] active:scale-[0.99]">
                <div className="flex items-center gap-3">
                  {avatars[u.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatars[u.id]} alt="avatar" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-800 rounded-full"></div>
                  )}
                  <span className="font-medium text-white">{u.username}</span>
                </div>
                <button 
                  onClick={() => sendRequest(u.id)}
                  className="bg-black border border-gray-600 hover:border-white active:scale-95 text-white font-medium px-4 py-1.5 rounded-full transition-all"
                >
                  Add Friend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incoming Requests */}
      <div className="border-b border-gray-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Friend Requests</h2>
          <button
            aria-label="Toggle friend requests"
            className="p-2 hover:bg-gray-900 rounded-full text-white"
            onClick={() => setShowIncoming(v => !v)}
          >
            {showIncoming ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>
            )}
          </button>
        </div>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full skeleton" />
                  <div>
                    <div className="h-4 w-32 rounded skeleton mb-2" />
                    <div className="h-3 w-24 rounded skeleton" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-20 rounded-full skeleton" />
                  <div className="h-8 w-20 rounded-full skeleton" />
                </div>
              </div>
            ))}
          </div>
        ) : incoming.length === 0 ? (
          <p className="text-gray-400">No new requests</p>
        ) : showIncoming ? (
          <div className="space-y-3 fade-in-up">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 hover:bg-gray-950 rounded-lg transition-all duration-200 hover:translate-y-[-1px] active:scale-[0.99]">
                <div className="flex items-center gap-3">
                  {avatars[r.requester_id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatars[r.requester_id]} alt="avatar" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-800 rounded-full"></div>
                  )}
                  <div>
                    <span className="font-medium text-white block">{profiles[r.requester_id]?.username ?? 'User'}</span>
                    <span className="text-gray-400 text-sm">wants to be friends</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => rejectRequest(r.id)}
                    className="bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-medium px-4 py-1.5 rounded-full transition-all"
                  >
                    Reject
                  </button>
                  <button 
                    onClick={() => acceptRequest(r.id)}
                    className="bg-sky-500 hover:bg-sky-600 active:scale-95 text-white font-medium px-4 py-1.5 rounded-full transition-all"
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Sent Requests */}
      <div className="border-b border-gray-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Pending Requests</h2>
          <button
            aria-label="Toggle pending requests"
            className="p-2 hover:bg-gray-900 rounded-full text-white"
            onClick={() => setShowSent(v => !v)}
          >
            {showSent ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>
            )}
          </button>
        </div>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full skeleton" />
                  <div>
                    <div className="h-4 w-28 rounded skeleton mb-2" />
                    <div className="h-3 w-20 rounded skeleton" />
                  </div>
                </div>
                <div className="h-5 w-16 rounded skeleton" />
              </div>
            ))}
          </div>
        ) : sent.length === 0 ? (
          <p className="text-gray-400">No pending requests</p>
        ) : showSent ? (
          <div className="space-y-3 fade-in-up">
            {sent.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 hover:bg-gray-950 rounded-lg transition-all duration-200 hover:translate-y-[-1px] active:scale-[0.99]">
                <div className="flex items-center gap-3">
                  {avatars[r.addressee_id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatars[r.addressee_id]} alt="avatar" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-800 rounded-full"></div>
                  )}
                  <div>
                    <span className="font-medium text-white block">{profiles[r.addressee_id]?.username ?? 'User'}</span>
                    <span className="text-gray-400 text-sm">Request sent</span>
                  </div>
                </div>
                <span className="text-gray-400 text-sm">Pending</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Friends List */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Friends</h2>
          <button
            aria-label="Toggle friends list"
            className="p-2 hover:bg-gray-900 rounded-full text-white"
            onClick={() => setShowFriends(v => !v)}
          >
            {showFriends ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>
            )}
          </button>
        </div>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full skeleton" />
                  <div className="h-4 w-36 rounded skeleton" />
                </div>
                <div className="h-8 w-24 rounded-full skeleton" />
              </div>
            ))}
          </div>
        ) : friends.length === 0 ? (
          <p className="text-gray-400">No friends yet</p>
        ) : showFriends ? (
          <div className="space-y-3 fade-in-up">
            {friends.map((r) => {
              const otherId = r.requester_id === me ? r.addressee_id : r.requester_id;
              return (
                <div key={r.id} className="flex items-center justify-between p-3 hover:bg-gray-950 rounded-lg transition-all duration-200 hover:translate-y-[-1px] active:scale-[0.99]">
                  <div className="flex items-center gap-3">
                    {avatars[otherId] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatars[otherId]} alt="avatar" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-800 rounded-full"></div>
                    )}
                    <span className="font-medium text-white">{profiles[otherId]?.username ?? 'User'}</span>
                  </div>
                  <button 
                    onClick={() => unfriend(otherId)}
                    className="bg-black border border-red-600 hover:border-red-500 active:scale-95 text-red-500 hover:bg-red-500/10 font-medium px-4 py-1.5 rounded-full transition-all"
                  >
                    Unfriend
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
