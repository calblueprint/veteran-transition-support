import type { ReactNode } from "react";
import { Oswald } from "next/font/google";
import Image from "next/image";
import styles from "./auth.module.css";

const heading = Oswald({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-auth-heading",
});

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.page} ${heading.variable}`}>
      <header className={styles.navbar}>
        <Image
          className={styles.logo}
          src="/images/vts-logo.png"
          alt="Veteran Transition Support"
          width={87}
          height={64}
          priority
        />
      </header>
      {children}
    </div>
  );
}
