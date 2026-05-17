import { decryptRefreshToken, getPickerPublicConfig, refreshGoogleAccessToken } from "@/lib/google-sheets";
import { requireHouseholdMember } from "@/lib/supabase/server";
import type { GoogleSheetsConnection } from "@/types/database";

export async function GET(request: Request) {
  const householdId = new URL(request.url).searchParams.get("householdId");

  if (!householdId) {
    return Response.json({ error: "Missing householdId" }, { status: 400 });
  }

  try {
    const { supabase } = await requireHouseholdMember(request, householdId);
    const { data, error } = await supabase
      .from("google_sheets_connections")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle();

    if (error || !data) {
      return Response.json({ error: "Connect Google first" }, { status: 404 });
    }

    const connection = data as GoogleSheetsConnection;
    return Response.json({
      ...getPickerPublicConfig(),
      accessToken: await refreshGoogleAccessToken(
        decryptRefreshToken(connection.encrypted_refresh_token)
      ),
    });
  } catch (error) {
    return error instanceof Response
      ? error
      : Response.json({ error: error instanceof Error ? error.message : "Unable to load picker" }, { status: 500 });
  }
}
