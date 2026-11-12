"use client";

import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AuthContextType = {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const requestId = useRef(0);

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      const currentRequest = ++requestId.current;
      const currentUser = session?.user ?? null;

      setUser(currentUser);
      setIsAdmin(false);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);

      async function checkAdminStatus() {
        try {
          const response = await fetch("/api/auth/admin-status", {
            method: "GET",
            cache: "no-store",
          });

          if (!response.ok) {
            throw new Error("Unable to check admin status.");
          }

          const result: { isAdmin: boolean } = await response.json();

          if (active && currentRequest === requestId.current) {
            setIsAdmin(result.isAdmin);
          }
        } catch (error) {
          console.error("Admin status check failed:", error);

          if (active && currentRequest === requestId.current) {
            setIsAdmin(false);
          }
        } finally {
          if (active && currentRequest === requestId.current) {
            setLoading(false);
          }
        }
      }

      void checkAdminStatus();
    });

    return () => {
      active = false;
      requestId.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    requestId.current += 1;
    setUser(null);
    setIsAdmin(false);
    setLoading(false);

    router.replace("/login");
    router.refresh();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
