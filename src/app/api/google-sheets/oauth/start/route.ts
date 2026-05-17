import { buildGoogleAuthUrl, createOauthState } from "@/lib/google-sheets";
import { requireHouseholdMember } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const householdId = new URL(request.url).searchParams.get("householdId");

  if (!householdId) {
    return Response.json({ error: "Missing householdId" }, { status: 400 });
  }

  try {
    const { user } = await requireHouseholdMember(request, householdId);
    return Response.json({
      url: buildGoogleAuthUrl(createOauthState(householdId, user.id)),
    });
  } catch (error) {
    return error instanceof Response
      ? error
      : Response.json({ error: error instanceof Error ? error.message : "Unable to start OAuth" }, { status: 500 });
  }
}
