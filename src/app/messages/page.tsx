"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface Profile { id: string; username: string; avatar_path: string | null }
interface Conversation { 
  id: string; 
  participant_1: string; 
  participant_2: string; 
  created_at: string; 
  updated_at: string;
}
interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

export default function MessagesPage() {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [friends, setFriends] = useState<Profile[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [avatarSignedUrls, setAvatarSignedUrls] = useState<Record<string, string>>({});
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setMe(data.session.user.id);
    });
  }, [router]);

  const loadConversations = async () => {
    if (!me) return;
    setLoadingConvos(true);
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .or(`participant_1.eq.${me},participant_2.eq.${me}`)
      .order("updated_at", { ascending: false });
    
    const convs = (data as Conversation[] | null) ?? [];
    setConversations(convs);

    // Load profiles for all participants
    const participantIds = new Set<string>();
    convs.forEach(conv => {
      participantIds.add(conv.participant_1);
      participantIds.add(conv.participant_2);
    });
    participantIds.delete(me);

    if (participantIds.size > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, username, avatar_path")
        .in("id", Array.from(participantIds));
      
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
    setLoadingConvos(false);
  };

  const loadFriends = async () => {
    if (!me) return;
    console.log('Loading friends for user:', me);
    setLoadingFriends(true);
    const { data } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`);

    console.log('Friends data:', data);
    const friendIds = ((data as any[] | null) ?? []).map(f => 
      f.requester_id === me ? f.addressee_id : f.requester_id
    );
    console.log('Friend IDs:', friendIds);

    if (friendIds.length > 0) {
      const { data: friendProfiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_path")
        .in("id", friendIds);
      console.log('Friend profiles:', friendProfiles);
      setFriends((friendProfiles as Profile[] | null) ?? []);
      
      // Load avatars for friends
      if (friendProfiles) {
        for (const friend of friendProfiles) {
          if (friend.avatar_path) {
            const { data } = await supabase.storage.from("avatars").createSignedUrl(friend.avatar_path, 3600);
            if (data?.signedUrl) {
              setAvatarSignedUrls(prev => ({ ...prev, [friend.id]: data.signedUrl }));
            }
          }
        }
      }
    } else {
      setFriends([]);
    }
    setLoadingFriends(false);
  };

  const loadMessages = async (conversationId: string) => {
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    
    setMessages((data as Message[] | null) ?? []);
    setLoadingMsgs(false);
  };

  useEffect(() => {
    if (me) {
      loadConversations();
      loadFriends();
    }
  }, [me]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation);
      
      // Subscribe to new messages in this conversation
      const channel = supabase
        .channel(`messages-${selectedConversation}`)
        .on("postgres_changes", { 
          event: "INSERT", 
          schema: "public", 
          table: "messages", 
          filter: `conversation_id=eq.${selectedConversation}` 
        }, () => {
          loadMessages(selectedConversation);
        })
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedConversation]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, selectedConversation]);

  // Subscribe to conversation updates
  useEffect(() => {
    if (me) {
      const channel = supabase
        .channel(`conversations-${me}`)
        .on("postgres_changes", { 
          event: "*", 
          schema: "public", 
          table: "conversations" 
        }, () => {
          loadConversations();
        })
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [me]);

  const startConversation = async (friendId: string) => {
    if (!me) return;
    
    console.log('Starting conversation with:', friendId);
    
    // Check if conversation already exists
    const existing = conversations.find(c => 
      (c.participant_1 === me && c.participant_2 === friendId) ||
      (c.participant_1 === friendId && c.participant_2 === me)
    );
    
    if (existing) {
      console.log('Found existing conversation:', existing.id);
      setSelectedConversation(existing.id);
      setShowNewChat(false);
      await loadMessages(existing.id);
      return;
    }

    // Create new conversation
    console.log('Creating new conversation...');
    const { data, error } = await supabase
      .from("conversations")
      .insert({ participant_1: me, participant_2: friendId })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      alert('Failed to start conversation: ' + error.message);
      return;
    }

    if (data) {
      console.log('Created conversation:', data.id);
      setSelectedConversation(data.id);
      setShowNewChat(false);
      await loadConversations();
      await loadMessages(data.id);
    }
  };

  const sendMessage = async () => {
    if (!me || !selectedConversation || !newMessage.trim()) return;

    const { error } = await supabase
      .from("messages")
      .insert({
        conversation_id: selectedConversation,
        sender_id: me,
        content: newMessage.trim()
      });

    if (!error) {
      setNewMessage("");
      await loadMessages(selectedConversation);
    }
  };

  const getOtherParticipant = (conv: Conversation | undefined) => {
    if (!conv) return '';
    return conv.participant_1 === me ? conv.participant_2 : conv.participant_1;
  };

  const filteredFriends = friends.filter(f => 
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!me) return null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-black max-w-none mx-auto">
      {/* Sidebar */}
      <div
        className={`flex-col border-r border-gray-800 bg-black flex-shrink-0 ${
          selectedConversation ? 'hidden md:flex md:w-80' : 'flex w-full md:w-80'
        }`}
      >
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Messages</h2>
          <button 
            className={`p-2 hover:bg-gray-900 rounded-full transition-colors text-white ${showNewChat ? 'rotate-45' : ''}`} 
            onClick={() => setShowNewChat(!showNewChat)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v13c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-13c0-.276-.224-.5-.5-.5h-15z"/>
              <path d="M12 11h-1v-1c0-.552-.448-1-1-1s-1 .448-1 1v1h-1c-.552 0-1 .448-1 1s.448 1 1 1h1v1c0 .552.448 1 1 1s1-.448 1-1v-1h1c.552 0 1-.448 1-1s-.448-1-1-1z"/>
            </svg>
          </button>
        </div>

        {showNewChat && (
          <div className="p-4 border-b border-gray-800 bg-gray-950 fade-in-up">
            <input
              type="text"
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black border border-gray-800 rounded-full px-4 py-2 text-white placeholder-gray-500 focus:border-sky-500 outline-none focus:ring-2 focus:ring-sky-500/30"
            />
            <div className="mt-3 max-h-40 overflow-y-auto">
              {filteredFriends.length > 0 ? (
                filteredFriends.map(friend => (
                  <div 
                    key={friend.id} 
                    className="flex items-center gap-3 p-3 hover:bg-gray-900 rounded-lg cursor-pointer transition-all duration-200 hover:translate-y-[-1px] active:scale-[0.99]"
                    onClick={() => {
                      console.log('Clicking friend:', friend);
                      startConversation(friend.id);
                    }}
                  >
                    {avatarSignedUrls[friend.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSignedUrls[friend.id]} alt="avatar" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 bg-gray-800 rounded-full" />
                    )}
                    <span className="text-white">{friend.username}</span>
                  </div>
                ))
              ) : (
                <div className="text-gray-400 text-sm p-3">No friends found</div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4 border-b border-gray-800">
                  <div className="w-12 h-12 rounded-full skeleton" />
                  <div className="flex-1">
                    <div className="h-3 w-2/5 rounded skeleton mb-2" />
                    <div className="h-3 w-3/5 rounded skeleton" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          conversations.map(conv => {
            const otherId = getOtherParticipant(conv);
            const otherUser = profiles[otherId];
            return (
              <div 
                key={conv.id}
                className={`flex items-center gap-3 p-4 cursor-pointer transition-all duration-200 border-b border-gray-800 hover:bg-gray-950 hover:translate-y-[-1px] active:scale-[0.99] ${
                  selectedConversation === conv.id ? 'bg-gray-950 border-l-2 border-sky-500' : 'border-l-2 border-transparent'
                }`}
                onClick={() => setSelectedConversation(conv.id)}
              >
                {avatarSignedUrls[otherId] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSignedUrls[otherId]} alt="avatar" className="w-12 h-12 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 bg-gray-800 rounded-full flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white">{otherUser?.username ?? 'Unknown'}</div>
                  <div className="text-gray-400 text-sm truncate">Start a conversation...</div>
                </div>
              </div>
            );
          }))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col ${selectedConversation ? '' : 'hidden md:flex'}`}>
        {selectedConversation ? (
          <>
            <div className="p-4 border-b border-gray-800 flex items-center gap-3">
              {/* Back button on mobile */}
              <button
                className="md:hidden p-2 hover:bg-gray-900 rounded-full text-white"
                onClick={() => setSelectedConversation(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
              </button>
              {(() => {
                const conv = conversations.find(c => c.id === selectedConversation);
                const otherId = getOtherParticipant(conv);
                return avatarSignedUrls[otherId] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSignedUrls[otherId]} alt="avatar" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 bg-gray-800 rounded-full" />
                );
              })()}
              <div className="font-medium text-white">
                {(() => {
                  const conv = conversations.find(c => c.id === selectedConversation);
                  const otherId = getOtherParticipant(conv);
                  return profiles[otherId]?.username ?? 'Unknown';
                })()}
              </div>
            </div>

            <div ref={messagesContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4">
              {loadingMsgs ? (
                <div className="space-y-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                      <div className="max-w-xs lg:max-w-md rounded-2xl p-4">
                        <div className="h-4 w-48 rounded skeleton mb-2" />
                        <div className="h-3 w-24 rounded skeleton" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              messages.map(msg => (
                <div 
                  key={msg.id} 
                  className={`flex fade-in-up ${msg.sender_id === me ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl transition-all duration-200 ${
                    msg.sender_id === me 
                      ? 'bg-sky-500 text-white hover:brightness-110' 
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                  }`}>
                    <div>{msg.content}</div>
                    <div className={`text-xs mt-1 ${
                      msg.sender_id === me ? 'text-sky-100' : 'text-gray-400'
                    }`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )))}
            </div>

            <div className="p-4 border-t border-gray-800 flex gap-3">
              <input
                type="text"
                placeholder="Start a new message"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                className="flex-1 bg-black border border-gray-800 rounded-full px-4 py-2 text-white placeholder-gray-500 focus:border-sky-500 outline-none focus:ring-2 focus:ring-sky-500/30"
              />
              <button 
                onClick={sendMessage}
                className="p-2 bg-sky-500 hover:bg-sky-600 active:scale-95 rounded-full text-white transition-all shadow-sm hover:shadow-md shadow-sky-500/20"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-2">Select a message</h3>
              <p className="text-gray-400">Choose from your existing conversations, or start a new one.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
