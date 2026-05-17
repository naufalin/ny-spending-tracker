"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export type GoogleSheetsStatus = {
  household_id: string;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  connected_by: string | null;
  connected_at: string;
  updated_at: string;
  last_sync_at: string | null;
  last_sync_status: "success" | "error" | null;
  last_sync_summary: Record<string, number> | null;
  last_sync_error: string | null;
};

export async function googleSheetsRequest(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(data?.error || "Google Sheets request failed.");
  }

  return data;
}
