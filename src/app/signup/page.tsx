"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      return setError(error.message);
    }

    const userId = data.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({ id: userId, username }, { onConflict: "id" });
    }

    setLoading(false);
    router.replace("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Join Nest</h1>
          <p className="text-gray-400">Create your account today</p>
        </div>
        
        <div className="space-y-4">
          <input 
            className="w-full bg-black border border-gray-800 rounded-lg p-3 text-white placeholder-gray-500 focus:border-sky-500 outline-none"
            placeholder="Username" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
          <input 
            className="w-full bg-black border border-gray-800 rounded-lg p-3 text-white placeholder-gray-500 focus:border-sky-500 outline-none"
            placeholder="Email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
          />
          <input 
            className="w-full bg-black border border-gray-800 rounded-lg p-3 text-white placeholder-gray-500 focus:border-sky-500 outline-none"
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
          />
          
          {error && <p className="text-red-500 text-sm">{error}</p>}
          
          <button 
            onClick={submit} 
            disabled={loading || !username}
            className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-800 disabled:opacity-50 text-white font-semibold py-3 rounded-full transition-colors"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
          
          <div className="text-center">
            <span className="text-gray-400">Already have an account? </span>
            <Link href="/login" className="text-sky-500 hover:text-sky-400 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
