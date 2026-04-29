import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "missing-publishable-key";

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabasePublishableKey);
  }

  return supabaseClient;
}
