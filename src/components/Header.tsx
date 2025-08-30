"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Header() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 h-16 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold text-white hover:text-sky-400 transition-colors">
        Nest
      </Link>
      <nav className="flex items-center gap-1 md:gap-2">
        {authed ? (
          <>
            <Link href="/" className="px-2 md:px-4 py-2 rounded-full hover:bg-gray-800 text-white transition-colors text-sm md:text-base">
              Feed
            </Link>
            <Link href="/friends" className="px-2 md:px-4 py-2 rounded-full hover:bg-gray-800 text-white transition-colors text-sm md:text-base">
              Friends
            </Link>
            <Link href="/messages" className="px-2 md:px-4 py-2 rounded-full hover:bg-gray-800 text-white transition-colors text-sm md:text-base">
              Messages
            </Link>
            <Link href="/profile" className="px-2 md:px-4 py-2 rounded-full hover:bg-gray-800 text-white transition-colors text-sm md:text-base">
              Profile
            </Link>
            <button onClick={logout} className="px-2 md:px-4 py-2 rounded-full hover:bg-gray-800 text-gray-300 transition-colors text-sm md:text-base">
              Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="px-3 md:px-4 py-2 rounded-full hover:bg-gray-800 text-white transition-colors text-sm md:text-base">
              Login
            </Link>
            <Link href="/signup" className="px-3 md:px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-full transition-colors text-sm md:text-base">
              Sign Up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
