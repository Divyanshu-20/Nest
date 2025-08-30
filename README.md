# Supa Social (Minimal Private Friends App)

A minimal private social app built with Next.js (App Router) + Supabase.

Features:
- Email/password Auth
- Profiles (username, avatar, bio)
- Friend requests + accept
- Posts (text or image to private Storage)
- Feed shows only friends’ (and your) posts
- Likes + Comments with Realtime

## 1) Setup

1. Copy env file
```
cp .env.example .env.local
```
Open `.env.local` and ensure values are correct for your project.

2. Install deps
```
npm install
```

3. Run DB schema in Supabase
- Open Supabase SQL editor.
- Paste and run the contents of `database/schema.sql`.

This creates tables, RLS policies, functions, triggers, and two private Storage buckets: `post-images` and `avatars`.

4. Start dev server
```
npm run dev
```

5. Sign up a user
- Visit `http://localhost:3000/signup`
- Create account (a profile is auto-created). You can then update username/bio/avatar at `/profile`.

## 2) File Structure

- `src/lib/supabaseClient.ts` — Supabase browser client
- `src/app/` — Next.js App Router pages
  - `/` feed
  - `/login`, `/signup`
  - `/profile`
  - `/friends`
- `src/components/` — UI components (Composer, Post, Comments, Header)
- `database/schema.sql` — Full database + RLS + Storage policies

## 3) Notes

- Storage buckets are private. The app generates signed URLs for images/avatars at render time. Only authenticated users can generate signed URLs, and only users who can read the related post row will learn the file path (kept minimal and private for a small friend group).
- Feed privacy is enforced by RLS. Only self + accepted friends can read your posts, likes, and comments.
- Code is commented for easy expansion.

## 4) Future Enhancements
- Pagination + optimistic updates
- Better profile discovery
- Notifications
- Server-side rendering of feed with Supabase Auth helpers
