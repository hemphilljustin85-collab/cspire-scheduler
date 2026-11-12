import "./globals.css";
import AppShell from "../src/components/AppShell";
import NativeSetup from "../src/components/NativeSetup";
import { START_PATH_KEY } from "../src/lib/native";

export const metadata = {
  title: "Workforce Scheduler",
  description: "Workforce Scheduling Platform",
  applicationName: "Workforce Scheduler",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Lets the iPhone app use the full screen; safe-area spacing is in globals.css.
  viewportFit: "cover",
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
        {/* In the iPhone app a reload always loads the home page; remember which page was open. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=location.pathname+location.search;if(location.pathname!=="/")sessionStorage.setItem(${JSON.stringify(START_PATH_KEY)},JSON.stringify({path:p,at:Date.now()}))}catch(e){}`,
          }}
        />
        <NativeSetup />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
