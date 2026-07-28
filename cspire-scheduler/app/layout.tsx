import "./globals.css";
import AppShell from "../src/components/AppShell";

export const metadata = {
  title: "Workforce Scheduler",
  description: "Workforce Scheduling Platform",
  applicationName: "Workforce Scheduler",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
