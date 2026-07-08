import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyFrank — Back Office IA",
  description: "Console de déploiement des agents IA de MyFrank",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
