"use client";

import { useState } from "react";
import { secondaryButtonClassName } from "@/components/app-shell";
import { googleSheetsRequest } from "@/lib/google-sheets-client";

export function GoogleSheetsSyncButton({ householdId }: { householdId: string }) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    setSyncing(true);
    setMessage("");

    try {
      const data = (await googleSheetsRequest("/api/google-sheets/sync", {
        method: "POST",
        body: JSON.stringify({ householdId }),
      })) as { summary: Record<string, number> };
      const totalRows = Object.values(data.summary).reduce((sum, count) => sum + count, 0);
      setMessage(`Synced ${totalRows} rows.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sync.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={sync} disabled={syncing} className={secondaryButtonClassName}>
        {syncing ? "Syncing..." : "Sync to Sheets"}
      </button>
      {message ? <span className="text-xs font-bold text-primary-dark">{message}</span> : null}
    </div>
  );
}
