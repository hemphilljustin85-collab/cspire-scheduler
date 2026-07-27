import "./globals.css";
import AppShell from "../src/components/AppShell";

export const metadata = {
  title: "Workforce Scheduler",
  description: "Workforce Scheduling Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
