import { requireHouseholdMember } from "@/lib/supabase/server";

export async function DELETE(request: Request) {
  const householdId = new URL(request.url).searchParams.get("householdId");

  if (!householdId) {
    return Response.json({ error: "Missing householdId" }, { status: 400 });
  }

  try {
    const { supabase } = await requireHouseholdMember(request, householdId);
    const { error } = await supabase
      .from("google_sheets_connections")
      .delete()
      .eq("household_id", householdId);

    if (error) {
      throw error;
    }

    return Response.json({ ok: true });
  } catch (error) {
    return error instanceof Response
      ? error
      : Response.json({ error: error instanceof Error ? error.message : "Unable to disconnect" }, { status: 500 });
  }
}
