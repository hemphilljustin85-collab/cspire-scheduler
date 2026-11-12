// Helpers for the iPhone app (Capacitor). The app is a self-contained copy of
// the scheduler running on the phone; these cover the few things a phone app
// does differently from a browser. On the website they fall back to the
// normal browser behaviour, so the same code works in both.

import { Capacitor } from "@capacitor/core";

/** sessionStorage key used to reopen the right page after a reload in the app. */
export const START_PATH_KEY = "native-start-path";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

/**
 * The website's address, for links people open in a browser (team schedule,
 * invites, password resets) and for the AI assistant. In the app this comes
 * from NEXT_PUBLIC_SITE_URL; on the website it's the current address.
 */
export function publicSiteUrl() {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  if (isNativeApp()) return configured;
  return configured || window.location.origin;
}

/** Print the page (the print sheet is already showing). Resolves when the print dialog closes. */
export async function printPage(name: string) {
  if (!isNativeApp()) {
    window.print();
    return;
  }
  const { Printer } = await import("@capgo/capacitor-printer");
  await Printer.printWebView({ name });
}

/** Save a file and open the share sheet (app), or download it (website). */
export async function saveFile(fileName: string, blob: Blob) {
  if (!isNativeApp()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const written = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  await Share.share({ title: fileName, files: [written.uri] });
}

/** Share or copy a link. Returns "shared", "copied", or "cancelled". */
export async function shareLink(title: string, url: string): Promise<"shared" | "copied" | "cancelled"> {
  try {
    if (isNativeApp()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, url });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "cancelled";
  }
}
