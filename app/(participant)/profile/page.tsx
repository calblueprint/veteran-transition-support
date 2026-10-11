import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import { ProfilePageContent } from "@/components/participant/profile-page-content";
import styles from "./profile-page.module.css";

const heading = Oswald({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-profile-heading",
});

export const metadata: Metadata = {
  title: "Your profile | Veteran Transition Support",
};

export default function ProfilePage() {
  return (
    <div className={`${styles.profile} ${heading.variable}`}>
      <ProfilePageContent />
    </div>
  );
}
