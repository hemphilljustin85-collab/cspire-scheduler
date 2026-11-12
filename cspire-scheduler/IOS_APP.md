# Workforce Scheduler iPhone app

The iPhone app is the full scheduler running **on the phone**: the same screens and logic as the website, compiled into the app (`npm run build:ios` → `out/`, wrapped by Capacitor in `ios/`). It reads and writes your Supabase database directly, like the website does in a browser. It doesn't load the website.

What's different in the app:

| | Website | iPhone app |
|---|---|---|
| Print (month on one page, one person, week) | Browser print | iPhone print dialog (AirPrint, or **Save to Files** as PDF) |
| Export to Excel | Downloads the file | Opens the share sheet (Save to Files, Mail, Messages…) |
| Team Schedule / invite / password-reset links | Your website's address | Your website's address (`NEXT_PUBLIC_SITE_URL`) |
| AI assistant | Runs on the website's server | Calls the website's server (it keeps the AI key secret) |

The app has its own icon and splash screen. App ID: `com.hemphill.workforcescheduler`, name **Workforce Scheduler**.

## One-time setup (no Mac needed)

1. **App Store Connect** → Apps → **+ New App**
   - Platform iOS, name *Workforce Scheduler*, bundle ID **com.hemphill.workforcescheduler** (register it under *Certificates, Identifiers & Profiles → Identifiers* first if it isn't in the list), SKU anything (e.g. `workforce-scheduler`).
   - Note the app's **Apple ID** number (App Information page). It's optional, but it keeps build numbers in order.
2. **Codemagic** → Add application → this GitHub repo → **codemagic.yaml** workflow.
   - Code signing: use the same App Store Connect API key as LawnLens (Teams → Integrations → Developer Portal). If its name isn't `codemagic`, change `app_store_connect:` in `codemagic.yaml` to its name.
   - In the app's **Environment variables**, create a group named **`workforce_scheduler`** with:
     - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the same values as in Vercel.
     - `NEXT_PUBLIC_SITE_URL`: your website, e.g. `https://your-app.vercel.app` (no trailing slash).
     - `APP_STORE_APPLE_ID`: the number from step 1 (optional).
3. **Supabase** → Authentication → URL Configuration → *Redirect URLs*: make sure your website's `/login` and `/reset-password` are listed. Emails from the app (sign-up confirmation, password reset) open the website.
4. In Codemagic, **Start new build** → `ios-testflight`. When it finishes, the build appears in **TestFlight** in about 10–20 minutes. Install it with the TestFlight app on your iPhone.

## Updating the app

The app has its own copy of the scheduler, so website changes reach the app when you **build it again**. After merging changes, start a new Codemagic build. Builds aren't started automatically, so merges don't use build minutes.

## Building locally (optional)

```bash
# needs the same three NEXT_PUBLIC_* variables set
npm run ios:sync        # build the app's copy and copy it into ios/
npx cap open ios        # on a Mac, opens Xcode
```

The app build leaves out two things that only work on a server: `app/api` (the AI assistant's server code, which the app calls on the website) and the unused placeholder page `app/employees/[id]`.
