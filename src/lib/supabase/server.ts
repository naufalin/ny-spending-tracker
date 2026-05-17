import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  return value;
}

export function getServiceSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireHouseholdMember(request: Request, householdId: string) {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.match(/^Bearer (.+)$/i)?.[1];

  if (!accessToken) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("household_id", householdId)
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!membership) {
    throw new Response("Forbidden", { status: 403 });
  }

  return { supabase, user: data.user as User };
}
