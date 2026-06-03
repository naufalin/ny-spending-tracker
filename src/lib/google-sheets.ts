import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoogleSheetsConnection } from "@/types/database";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

type ServiceClient = SupabaseClient;

type SyncSummary = {
  Transactions: number;
  Transfers: number;
  Budgets: number;
  Categories: number;
  Subcategories: number;
  Channels: number;
};

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getEncryptionKey() {
  return createHash("sha256").update(requiredEnv("GOOGLE_TOKEN_ENCRYPTION_SECRET")).digest();
}

export function encryptRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((value) => value.toString("base64url")).join(".");
}

export function decryptRefreshToken(payload: string) {
  const [iv, tag, encrypted] = payload.split(".").map((value) => Buffer.from(value, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function createOauthState(householdId: string, userId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      householdId,
      userId,
      nonce: randomBytes(12).toString("base64url"),
      exp: Date.now() + 10 * 60 * 1000,
    })
  ).toString("base64url");
  const signature = createHmac("sha256", requiredEnv("GOOGLE_OAUTH_STATE_SECRET"))
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function readOauthState(state: string) {
  const [payload, signature] = state.split(".");
  const expected = createHmac("sha256", requiredEnv("GOOGLE_OAUTH_STATE_SECRET"))
    .update(payload)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid OAuth state");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    householdId: string;
    userId: string;
    exp: number;
  };

  if (parsed.exp < Date.now()) {
    throw new Error("Expired OAuth state");
  }

  return parsed;
}

export function buildGoogleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requiredEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/drive.file",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function requestGoogleToken(body: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google token request failed (${response.status})`);
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export async function exchangeCodeForTokens(code: string) {
  return requestGoogleToken(
    new URLSearchParams({
      code,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requiredEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    })
  );
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const result = await requestGoogleToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    })
  );

  return result.access_token;
}

export function getPickerPublicConfig() {
  return {
    apiKey: requiredEnv("GOOGLE_PICKER_API_KEY"),
    appId: requiredEnv("GOOGLE_PICKER_APP_ID"),
  };
}

function creatorLabel(userId: string | null, profiles: Map<string, string>) {
  return userId ? profiles.get(userId) || "Household member" : "Someone";
}

async function googleRequest(accessToken: string, path: string, init?: RequestInit) {
  const response = await fetch(`${SHEETS_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string; status?: string } }
      | null;
    const detail = body?.error?.message || body?.error?.status;
    throw new Error(
      detail
        ? `Google Sheets request failed (${response.status}): ${detail}`
        : `Google Sheets request failed (${response.status})`
    );
  }

  return response;
}

async function ensureManagedTabs(accessToken: string, spreadsheetId: string) {
  const metadata = (await (
    await googleRequest(accessToken, `/${spreadsheetId}?fields=sheets.properties`)
  ).json()) as { sheets?: Array<{ properties: { title: string; sheetId: number } }> };
  const existing = new Map((metadata.sheets || []).map((sheet) => [sheet.properties.title, sheet.properties.sheetId]));
  const managedTabs = ["Transactions", "Transfers", "Budgets", "Categories", "Subcategories", "Channels"];
  const missing = managedTabs.filter((title) => !existing.has(title));

  if (missing.length) {
    await googleRequest(accessToken, `/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
  }
}

function quoteSheetTitle(title: string) {
  return `'${title.replaceAll("'", "''")}'`;
}

async function replaceSheetValues(
  accessToken: string,
  spreadsheetId: string,
  title: string,
  values: Array<Array<string | number>>
) {
  const encodedRange = encodeURIComponent(`${quoteSheetTitle(title)}!A:Z`);
  await googleRequest(accessToken, `/${spreadsheetId}/values/${encodedRange}:clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  await googleRequest(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(`${quoteSheetTitle(title)}!A1`)}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values }),
    }
  );
}

export async function syncHouseholdToGoogleSheets(
  supabase: ServiceClient,
  connection: GoogleSheetsConnection
) {
  if (!connection.spreadsheet_id) {
    throw new Error("Choose a spreadsheet before syncing.");
  }

  const accessToken = await refreshGoogleAccessToken(
    decryptRefreshToken(connection.encrypted_refresh_token)
  );
  const householdId = connection.household_id;
  const [transactions, transfers, budgets, categories, channels, subcategories] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, categories(id, name, type), subcategories(id, name), channels(id, name)")
      .eq("household_id", householdId)
      .order("spent_at")
      .order("created_at"),
    supabase
      .from("transfers")
      .select("*, from_channel:channels!transfers_from_channel_id_fkey(id, name), to_channel:channels!transfers_to_channel_id_fkey(id, name), fee_category:categories(id, name, type)")
      .eq("household_id", householdId)
      .order("transferred_at")
      .order("created_at"),
    supabase
      .from("budgets")
      .select("*, categories(id, name, type)")
      .eq("household_id", householdId)
      .order("month"),
    supabase.from("categories").select("*").eq("household_id", householdId).order("name"),
    supabase.from("channels").select("*").eq("household_id", householdId).order("name"),
    supabase.from("subcategories").select("*, categories(name)").eq("household_id", householdId).order("name"),
  ]);

  for (const result of [transactions, transfers, budgets, categories, channels, subcategories]) {
    if (result.error) {
      throw result.error;
    }
  }
  const userIds = Array.from(
    new Set(
      [...(transactions.data || []), ...(transfers.data || [])]
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile.display_name]));

  const transactionRows = [
    ["Date", "Type", "Amount", "Category", "Sub-category", "Channel", "Note", "Added by", "Created at", "Record ID"],
    ...(transactions.data || []).map((row) => [
      row.spent_at,
      row.type,
      row.amount,
      row.categories?.name || "",
      row.subcategories?.name || "",
      row.channels?.name || "",
      row.note || "",
      creatorLabel(row.user_id, profileMap),
      row.created_at || "",
      row.id,
    ]),
  ];
  const transferRows = [
    ["Date", "Amount", "From channel", "To channel", "Fee amount", "Fee category", "Note", "Added by", "Created at", "Record ID"],
    ...(transfers.data || []).map((row) => [
      row.transferred_at,
      row.amount,
      row.from_channel?.name || "",
      row.to_channel?.name || "",
      row.fee_amount,
      row.fee_category?.name || "",
      row.note || "",
      creatorLabel(row.user_id, profileMap),
      row.created_at || "",
      row.id,
    ]),
  ];
  const budgetRows = [
    ["Month", "Category", "Type", "Amount", "Record ID"],
    ...(budgets.data || []).map((row) => [
      row.month,
      row.categories?.name || "",
      row.categories?.type || "",
      row.amount,
      row.id,
    ]),
  ];
  const categoryRows = [
    ["Name", "Type", "Record ID"],
    ...(categories.data || []).map((row) => [row.name, row.type, row.id]),
  ];
  const channelRows = [
    ["Name", "Record ID"],
    ...(channels.data || []).map((row) => [row.name, row.id]),
  ];
  const subcategoryRows = [
    ["Name", "Category", "Record ID"],
    ...(subcategories.data || []).map((row) => [row.name, row.categories?.name || "", row.id]),
  ];

  await ensureManagedTabs(accessToken, connection.spreadsheet_id);
  await Promise.all([
    replaceSheetValues(accessToken, connection.spreadsheet_id, "Transactions", transactionRows),
    replaceSheetValues(accessToken, connection.spreadsheet_id, "Transfers", transferRows),
    replaceSheetValues(accessToken, connection.spreadsheet_id, "Budgets", budgetRows),
    replaceSheetValues(accessToken, connection.spreadsheet_id, "Categories", categoryRows),
    replaceSheetValues(accessToken, connection.spreadsheet_id, "Subcategories", subcategoryRows),
    replaceSheetValues(accessToken, connection.spreadsheet_id, "Channels", channelRows),
  ]);

  const summary: SyncSummary = {
    Transactions: transactionRows.length - 1,
    Transfers: transferRows.length - 1,
    Budgets: budgetRows.length - 1,
    Categories: categoryRows.length - 1,
    Subcategories: subcategoryRows.length - 1,
    Channels: channelRows.length - 1,
  };

  return summary;
}
