import "./globals.css";
export const metadata = {
  title: "ERA • ERP",
  description: "Núcleo operacional ERA Technology",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
