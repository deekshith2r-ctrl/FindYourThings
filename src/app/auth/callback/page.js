"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState("Completing Google Sign-in...");

  useEffect(() => {
    if (!supabase) {
      router.push("/");
      return;
    }

    // Listen for authentication state change (e.g., token received and validated)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        setStatusMessage("Signed in successfully! Redirecting...");
        router.push("/");
      }
    });

    // Fallback: check if session already exists
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setStatusMessage("Authentication error. Redirecting to home...");
        setTimeout(() => router.push("/"), 2000);
      } else if (session) {
        router.push("/");
      }
    });

    // Safety timeout in case the redirect is delayed
    const timer = setTimeout(() => {
      router.push("/");
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-12 h-12 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-4" />
      <p className="text-sm font-medium text-slate-300">{statusMessage}</p>
    </div>
  );
}
