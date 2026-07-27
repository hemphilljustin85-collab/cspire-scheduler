import "./globals.css";
import Sidebar from "../src/components/Sidebar";

export const metadata = {
  title: "Workforce Scheduler",
  description: "Workforce Scheduling Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-100">
        <div className="flex">
          <Sidebar />

          <main className="flex-1 p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}