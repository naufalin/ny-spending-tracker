import { encryptRefreshToken, exchangeCodeForTokens, readOauthState } from "@/lib/google-sheets";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

function profileRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/profile", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return profileRedirect(request, { googleSheets: "error" });
  }

  try {
    const parsedState = readOauthState(state);
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token");
    }

    const supabase = getServiceSupabaseClient();
    const { error } = await supabase.from("google_sheets_connections").upsert({
      household_id: parsedState.householdId,
      spreadsheet_id: null,
      spreadsheet_name: null,
      connected_by: parsedState.userId,
      encrypted_refresh_token: encryptRefreshToken(tokens.refresh_token),
      updated_at: new Date().toISOString(),
      last_sync_at: null,
      last_sync_status: null,
      last_sync_summary: null,
      last_sync_error: null,
    });

    if (error) {
      throw error;
    }

    return profileRedirect(request, { googleSheets: "pick" });
  } catch {
    return profileRedirect(request, { googleSheets: "error" });
  }
}
