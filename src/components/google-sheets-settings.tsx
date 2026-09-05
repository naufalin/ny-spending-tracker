"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, buttonClassName, secondaryButtonClassName } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import {
  googleSheetsRequest,
  type GoogleSheetsStatus,
} from "@/lib/google-sheets-client";

type PickerConfig = {
  accessToken: string;
  apiKey: string;
  appId: string;
};

declare global {
  interface GooglePickerBuilder {
    addView(view: unknown): GooglePickerBuilder;
    setOAuthToken(token: string): GooglePickerBuilder;
    setDeveloperKey(key: string): GooglePickerBuilder;
    setAppId(appId: string): GooglePickerBuilder;
    setCallback(callback: (data: {
      action: string;
      docs?: Array<{ id: string; name: string }>;
    }) => void): GooglePickerBuilder;
    build(): { setVisible(value: boolean): void };
  }

  interface Window {
    google?: {
      picker: {
        Action: { PICKED: string };
        DocsView: new () => { setMimeTypes(value: string): unknown };
        PickerBuilder: new () => GooglePickerBuilder;
      };
    };
    gapi?: {
      load(api: string, callback: () => void): void;
    };
  }
}

function loadPickerApi() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.picker && window.gapi) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-google-picker="true"]');
    if (existing) {
      existing.addEventListener("load", () => window.gapi?.load("picker", resolve));
      existing.addEventListener("error", () => reject(new Error("Unable to load Google Picker.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.dataset.googlePicker = "true";
    script.onload = () => window.gapi?.load("picker", resolve);
    script.onerror = () => reject(new Error("Unable to load Google Picker."));
    document.body.append(script);
  });
}

function formatSyncTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not synced yet";
}

export function GoogleSheetsSettings({ householdId }: { householdId: string }) {
  const { addToast } = useToast();
  const [connection, setConnection] = useState<GoogleSheetsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [message, setMessage] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("googleSheets") === "error"
      ? "Google authorization did not finish. Please try again."
      : ""
  );

  const loadStatus = useCallback(async () => {
    const data = (await googleSheetsRequest(
      `/api/google-sheets/status?householdId=${householdId}`
    )) as { connection: GoogleSheetsStatus | null };
    setConnection(data.connection);
  }, [householdId]);

  const openPicker = useCallback(async () => {
    setBusy(true);

    try {
      const config = (await googleSheetsRequest(
        `/api/google-sheets/picker-config?householdId=${householdId}`
      )) as PickerConfig;
      await loadPickerApi();
      const docsView = new window.google!.picker.DocsView();
      docsView.setMimeTypes("application/vnd.google-apps.spreadsheet");
      const picker = new window.google!.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.apiKey)
        .setAppId(config.appId)
        .setCallback(async (data) => {
          if (data.action !== window.google!.picker.Action.PICKED || !data.docs?.[0]) {
            return;
          }

          const selected = data.docs[0];
          try {
            await googleSheetsRequest("/api/google-sheets/connect-sheet", {
              method: "POST",
              body: JSON.stringify({
                householdId,
                spreadsheetId: selected.id,
                spreadsheetName: selected.name,
              }),
            });
            addToast({ title: `${selected.name} connected`, tone: "success" });
            await loadStatus();
          } catch (error) {
            addToast({
              title: "Unable to save spreadsheet",
              body: error instanceof Error ? error.message : undefined,
              tone: "danger",
            });
          } finally {
            setBusy(false);
          }
        })
        .build();
      picker.setVisible(true);
      setBusy(false);
    } catch (error) {
      setBusy(false);
      addToast({
        title: "Unable to open Google Picker",
        body: error instanceof Error ? error.message : undefined,
        tone: "danger",
      });
    }
  }, [addToast, householdId, loadStatus]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialStatus() {
      try {
        const data = (await googleSheetsRequest(
          `/api/google-sheets/status?householdId=${householdId}`
        )) as { connection: GoogleSheetsStatus | null };

        if (isMounted) {
          setConnection(data.connection);
        }
      } catch (error) {
        if (isMounted) {
          setMessage(error instanceof Error ? error.message : "Unable to load Google Sheets status.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadInitialStatus();

    return () => {
      isMounted = false;
    };
  }, [householdId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleSheets = params.get("googleSheets");

    if (googleSheets === "pick") {
      window.setTimeout(() => void openPicker(), 0);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (googleSheets === "error") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [openPicker]);

  async function connectGoogle() {
    setBusy(true);

    try {
      const data = (await googleSheetsRequest(
        `/api/google-sheets/oauth/start?householdId=${householdId}`
      )) as { url: string };
      window.location.href = data.url;
    } catch (error) {
      setBusy(false);
      addToast({
        title: "Unable to start Google connection",
        body: error instanceof Error ? error.message : undefined,
        tone: "danger",
      });
    }
  }

  async function disconnect() {
    setBusy(true);

    try {
      await googleSheetsRequest(`/api/google-sheets/disconnect?householdId=${householdId}`, {
        method: "DELETE",
      });
      setConnection(null);
      setDisconnectOpen(false);
      addToast({ title: "Google Sheets disconnected", tone: "success" });
    } catch (error) {
      addToast({
        title: "Unable to disconnect",
        body: error instanceof Error ? error.message : undefined,
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-black text-foreground">Google Sheets</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {connection?.spreadsheet_name
              ? connection.spreadsheet_name
              : connection
                ? "Google connected. Choose a spreadsheet to finish setup."
                : "Connect one spreadsheet for household exports."}
          </p>
        </div>

        {connection ? (
          <div className="rounded-2xl bg-background px-4 py-3 text-sm text-muted">
            <p>
              Last sync: <span className="font-bold text-foreground">{formatSyncTime(connection.last_sync_at)}</span>
            </p>
            {connection.last_sync_status === "error" && connection.last_sync_error ? (
              <p className="mt-1 text-danger">{connection.last_sync_error}</p>
            ) : null}
          </div>
        ) : null}

        {message ? <p className="text-sm font-bold text-danger">{message}</p> : null}

        <div className="flex gap-2">
          {!connection ? (
            <button type="button" disabled={busy || loading} onClick={connectGoogle} className={buttonClassName}>
              {busy ? "Connecting..." : "Connect Google"}
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={openPicker} className={buttonClassName}>
                {connection.spreadsheet_id ? "Replace sheet" : "Choose sheet"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDisconnectOpen(true)}
                className={secondaryButtonClassName}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={disconnectOpen}
        onClose={() => {
          if (!busy) {
            setDisconnectOpen(false);
          }
        }}
        onConfirm={disconnect}
        busy={busy}
        title="Disconnect Google Sheets?"
        body="Exports will stop until you connect a spreadsheet again. Your ledger data is not affected."
        confirmLabel="Disconnect"
      />
    </Card>
  );
}
