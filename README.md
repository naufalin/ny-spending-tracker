# Our Little Ledger

A simple mobile-first household spending tracker built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file:

```bash
cp .env.example .env.local
```

3. Add your Supabase values to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

4. Start the app:

```bash
npm run dev
```

Open http://localhost:3000.

## Supabase setup

Run `supabase/schema.sql` in the Supabase SQL editor. It creates the initial tables, enables Row Level Security, and adds policies so users only access households where they are listed in `household_members`.

For this first version, household setup is manual:

1. Create or invite both users through Supabase Auth.
2. Create one row in `households`.
3. Insert both users into `household_members` with the same `household_id`.
4. Add categories from the app, or insert a few manually.

Example membership insert:

```sql
insert into household_members (household_id, user_id, role)
values
  ('HOUSEHOLD_UUID', 'USER_UUID_1', 'member'),
  ('HOUSEHOLD_UUID', 'USER_UUID_2', 'member');
```

## Netlify deployment

Set these environment variables in Netlify:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The build command is `npm run build`. Netlify applies its current Next.js adapter automatically for modern Next.js projects, so no pinned plugin is needed.

## Scripts

```bash
npm run lint
npm run build
```
