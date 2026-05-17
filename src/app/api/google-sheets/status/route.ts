import { requireHouseholdMember } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const householdId = new URL(request.url).searchParams.get("householdId");

  if (!householdId) {
    return Response.json({ error: "Missing householdId" }, { status: 400 });
  }

  try {
    const { supabase } = await requireHouseholdMember(request, householdId);
    const { data, error } = await supabase
      .from("google_sheets_connections")
      .select("household_id, spreadsheet_id, spreadsheet_name, connected_by, connected_at, updated_at, last_sync_at, last_sync_status, last_sync_summary, last_sync_error")
      .eq("household_id", householdId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Response.json({ connection: data });
  } catch (error) {
    return error instanceof Response
      ? error
      : Response.json({ error: error instanceof Error ? error.message : "Unable to load status" }, { status: 500 });
  }
}
