import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Log in | Veteran Transition Support",
};

export default function LoginPage() {
  return (
    <AuthPageShell>
      <Suspense fallback={<p>Loading login...</p>}>
        <LoginForm />
      </Suspense>
    </AuthPageShell>
  );
}
