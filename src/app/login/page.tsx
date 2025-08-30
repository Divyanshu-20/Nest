"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showVerify, setShowVerify] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const msg = error.message || "";
      setError(msg);
      if (msg.toLowerCase().includes("email not confirmed")) {
        setShowVerify(true);
      }
      return;
    }
    router.replace("/");
  };

  const resend = async () => {
    if (!email) {
      setError("Enter your email above, then click Resend");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setLoading(false);
    if (error) setError(error.message);
    else setInfo("Confirmation email sent. Check your inbox and spam folder.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Sign in to Nest</h1>
          <p className="text-gray-400">Welcome back!</p>
        </div>
        
        <div className="space-y-4">
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
          {info && <p className="text-green-500 text-sm">{info}</p>}
          
          <button 
            onClick={submit} 
            disabled={loading}
            className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-800 disabled:opacity-50 text-white font-semibold py-3 rounded-full transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          
          <div className="text-center">
            <span className="text-gray-400">Don't have an account? </span>
            <Link href="/signup" className="text-sky-500 hover:text-sky-400 transition-colors">
              Sign up
            </Link>
          </div>
          
          {error?.toLowerCase().includes("email not confirmed") && (
            <button 
              onClick={resend} 
              disabled={loading}
              className="w-full text-sky-500 hover:text-sky-400 text-sm py-2 transition-colors disabled:opacity-50"
            >
              Resend confirmation email
            </button>
          )}
        </div>

        {showVerify && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" className="w-[90%] max-w-md rounded-2xl bg-gray-900 border border-gray-800 p-6 fade-in-up shadow-xl">
              <h2 className="text-xl font-bold text-white mb-2">Confirm your email</h2>
              <p className="text-gray-300 text-sm mb-4">
                We sent a confirmation link to <span className="text-white font-medium">{email || "your email"}</span>.
                Open your inbox to verify, then return here to sign in.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href="https://mail.google.com/mail/u/0/#inbox"
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-center bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 rounded-full transition-colors active:scale-95"
                >
                  Open Gmail
                </a>
                <button
                  onClick={resend}
                  disabled={loading}
                  className="flex-1 border border-gray-700 hover:border-white text-white py-2.5 rounded-full transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? "Resending..." : "Resend email"}
                </button>
                <button
                  onClick={() => setShowVerify(false)}
                  className="flex-1 text-gray-300 hover:text-white py-2.5 rounded-full transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
