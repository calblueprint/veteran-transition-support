import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import { SignUpForm } from "@/components/auth/sign-up-form";
import styles from "./sign-up.module.css";

const heading = Oswald({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-sign-up-heading",
});

export const metadata: Metadata = {
  title: "Create your account | Veteran Transition Support",
};

export default function SignUpPage() {
  return (
    <div className={`${styles.page} ${heading.variable}`}>
      <SignUpForm />
    </div>
  );
}