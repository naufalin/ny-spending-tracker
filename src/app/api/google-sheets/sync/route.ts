import { syncHouseholdToGoogleSheets } from "@/lib/google-sheets";
import { requireHouseholdMember } from "@/lib/supabase/server";
import type { GoogleSheetsConnection } from "@/types/database";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { householdId?: string };

    if (!body.householdId) {
      return Response.json({ error: "Missing householdId" }, { status: 400 });
    }

    const { supabase } = await requireHouseholdMember(request, body.householdId);
    const { data, error } = await supabase
      .from("google_sheets_connections")
      .select("*")
      .eq("household_id", body.householdId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return Response.json({ error: "Connect Google first" }, { status: 404 });
    }

    try {
      const summary = await syncHouseholdToGoogleSheets(supabase, data as GoogleSheetsConnection);
      const now = new Date().toISOString();
      await supabase
        .from("google_sheets_connections")
        .update({
          last_sync_at: now,
          last_sync_status: "success",
          last_sync_summary: summary,
          last_sync_error: null,
          updated_at: now,
        })
        .eq("household_id", body.householdId);

      return Response.json({ summary, lastSyncAt: now });
    } catch (syncError) {
      await supabase
        .from("google_sheets_connections")
        .update({
          last_sync_status: "error",
          last_sync_error: syncError instanceof Error ? syncError.message : "Sync failed",
          updated_at: new Date().toISOString(),
        })
        .eq("household_id", body.householdId);

      throw syncError;
    }
  } catch (error) {
    return error instanceof Response
      ? error
      : Response.json({ error: error instanceof Error ? error.message : "Unable to sync" }, { status: 500 });
  }
}
