# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Wasp MLR** is an AI-powered restaurant recommendation web app for Mangalore, India. Users chat with an AI persona ("Wasp MLR") that recommends food and restaurants based on mood, company, time of day, and cravings. It is a React SPA deployed on Vercel with a Supabase backend.

## Commands

```bash
npm run dev          # Start Vite dev server on port 8080
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint check
npm run test         # Run Vitest once
npm run test:watch   # Vitest in watch mode
```

To run a single test file:
```bash
npx vitest run src/path/to/file.test.ts
```

## Architecture

### Two separate runtimes

There are **two chat function implementations** that must stay in sync:

| File | Runtime | When used |
|---|---|---|
| `api/chat.ts` | Vercel Edge (Node-compatible) | Production (Vercel deployment) |
| `supabase/functions/chat/index.ts` | Deno | Supabase Edge Functions (alternative deploy) |

Both call the Anthropic API directly via `fetch` with the same system prompt. The Vercel edge function (`api/chat.ts`) is the primary one — it also does RAG enrichment. If you update the system prompt or model in one, update the other.

### Data flow for a chat message

1. `src/pages/ChatPage.tsx` — user sends message, calls `POST /api/chat`
2. `api/chat.ts` — runs RAG (`getRagContext`), appends community data to system prompt, streams Anthropic response
3. RAG sources (all via direct Supabase REST): `community_recommendations`, `blog_posts`, `chat_feedback`
4. Response streamed back as SSE; frontend parses `[PLACES: ...]` sentinel at end of response to extract place names for UI (e.g., map links, save modal)

### RAG system (`api/chat.ts` → `getRagContext`)

Keywords are matched against the user message across three lists: `CUISINE_KEYWORDS`, `LOCATION_KEYWORDS`, `MOOD_KEYWORDS`. Matched keywords drive Supabase REST queries for community picks, approved blog posts, and high-rated feedback. The assembled context is appended to the system prompt before the Anthropic call.

### Authentication & anonymous users

- Auth is Supabase Auth (`src/hooks/useAuth.tsx`)
- Anonymous (unauthenticated) users are tracked via a device ID (`src/lib/deviceId.ts`) sent as a custom header to the Supabase client (`src/lib/anonSupabase.ts`) — this allows saving recommendations and feedback without sign-in
- The `AppContext` (`src/context/AppContext.tsx`) holds mock project/task data unrelated to the restaurant features — it's a leftover from the project template

### Admin access

`src/pages/AdminPage.tsx` is gated to `kev.cornelio@gmail.com` — checked in-component against the authenticated user's email.

### Database

Migrations are in `supabase/migrations/`. All tables have RLS enabled. Key tables:
- `community_recommendations` — user-saved restaurants (rating, cuisine_type, location, tags, helpful_count)
- `blog_posts` — food stories with `status: pending | approved | rejected`
- `chat_sessions` + `chat_messages` — conversation history
- `chat_feedback` — per-place ratings and comments from chat sessions
- `profiles` — auto-created on signup via trigger

### Styling conventions

- Tailwind CSS with a custom HSL CSS variable token system (defined in `src/index.css`)
- Dark mode via `class` strategy (`dark:` prefix)
- shadcn/ui components live in `src/components/ui/` — do not hand-edit generated shadcn files; use the CLI to add/update components
- Custom fonts: DM Sans (body), Crimson Pro (serif), SF Mono (mono)

### Environment variables

Required in `.env` for local dev:
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Required server-side (Vercel env or Supabase secrets):
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   # used by edge function for privileged RAG queries
ANTHROPIC_API_KEY
```

### TypeScript strictness

`tsconfig.json` has `noImplicitAny: false` and `strictNullChecks: false`. Type assertions and `any` are common throughout — don't add strict checks unless fixing an actual bug.
