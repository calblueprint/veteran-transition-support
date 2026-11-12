import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/global.css";
import RoleNavigation from "@/components/RoleNavigation";
import { AuthProvider } from "@/contexts/AuthContext";

// font definitions
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// site metadata - what shows up on embeds
export const metadata: Metadata = {
  title: "Project Name",
  description: "Description of project",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={sans.className}>
        <AuthProvider>
          <RoleNavigation />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
