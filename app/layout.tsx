import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArenaOdds — Sua arena esportiva",
  description: "Acompanhe jogos, mercados e seus palpites em uma experiência completa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
