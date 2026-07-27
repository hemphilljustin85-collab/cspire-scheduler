# Deploying the C Spire Scheduler

## 1. Keep secrets out of the project

Do not upload `.env.local`. This project uses these Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Copy the values from your existing local `.env.local` into Vercel's project environment settings.

## 2. Upload the project to GitHub

Create a private GitHub repository, then upload the contents of this folder. The included `.gitignore` excludes `.env.local`, `.next`, and `node_modules`.

## 3. Import into Vercel

1. In Vercel, choose **Add New → Project**.
2. Import the GitHub repository.
3. Vercel should detect **Next.js** automatically.
4. Add both Supabase environment variables under **Environment Variables**.
5. Apply them to Production, Preview, and Development.
6. Deploy.

## 4. Test the live site

- Manager schedule builder: `/schedule`
- Read-only team schedule: `/team-schedule`
- Publish a week, then use **Copy Team Link**.
- The Team Schedule page includes a native **Share** button for text messages, email, Facebook, and other installed apps on supported phones.

## Important security note

The project was developed with permissive Supabase row-level-security policies. Do not treat the manager pages as secure merely because the Team Schedule page is read-only. Before sharing the live site broadly, replace development policies with authenticated manager policies and add manager login.

Email and automatic SMS notifications also require a provider account and credentials, plus email/phone fields for employees. Those are not activated in this package because no provider or credentials were supplied.
