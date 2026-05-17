import { requireHouseholdMember } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      householdId?: string;
      spreadsheetId?: string;
      spreadsheetName?: string;
    };

    if (!body.householdId || !body.spreadsheetId || !body.spreadsheetName) {
      return Response.json({ error: "Missing spreadsheet details" }, { status: 400 });
    }

    const { supabase } = await requireHouseholdMember(request, body.householdId);
    const { data, error } = await supabase
      .from("google_sheets_connections")
      .update({
        spreadsheet_id: body.spreadsheetId,
        spreadsheet_name: body.spreadsheetName,
        updated_at: new Date().toISOString(),
      })
      .eq("household_id", body.householdId)
      .select("spreadsheet_id, spreadsheet_name")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return Response.json({ error: "Connect Google first" }, { status: 404 });
    }

    return Response.json({ connection: data });
  } catch (error) {
    return error instanceof Response
      ? error
      : Response.json({ error: error instanceof Error ? error.message : "Unable to save sheet" }, { status: 500 });
  }
}
