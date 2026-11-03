import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import type { JWKPublicKey } from "plaid";
import { plaid } from "@/lib/plaid";
import { adminClient, adminConfigured } from "@/lib/supabase-admin";
import { PLAID_ITEM_COLUMNS, syncItem, type PlaidItemRow } from "@/lib/sync";
import { refreshPlanFromLinked } from "@/lib/plan-sync";

export const maxDuration = 60;

// Plaid signs each webhook with an ES256 JWT (Plaid-Verification header) whose payload carries the body's sha256.
const keys = new Map<string, JWKPublicKey>();

async function verificationKey(kid: string): Promise<JWKPublicKey | null> {
  let key = keys.get(kid);
  if (!key || key.expired_at != null) {
    key = (await plaid().webhookVerificationKeyGet({ key_id: kid })).data.key;
    keys.set(kid, key);
  }
  return key.expired_at == null ? key : null; // Plaid rejects expired keys
}

async function verified(req: Request, raw: string): Promise<boolean> {
  try {
    const token = req.headers.get("plaid-verification");
    if (!token) return false;
    const { alg, kid } = decodeProtectedHeader(token);
    if (alg !== "ES256" || !kid) return false;
    const jwk = await verificationKey(kid);
    if (!jwk) return false;
    const key = await importJWK({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, alg: jwk.alg, use: jwk.use, kid: jwk.kid }, "ES256");
    const { payload } = await jwtVerify(token, key, { algorithms: ["ES256"], maxTokenAge: "5 minutes" });
    const claimed = Buffer.from(String(payload.request_body_sha256 ?? ""), "hex");
    const actual = createHash("sha256").update(raw).digest();
    return claimed.length === actual.length && timingSafeEqual(claimed, actual);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verified(req, raw))) return NextResponse.json({ error: "Invalid Plaid-Verification" }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set; the webhook needs the service-role client" }, { status: 503 });
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { webhook_type: type, webhook_code: code, item_id } = body ?? {};
  if (typeof item_id !== "string") return NextResponse.json({ ok: true, ignored: true });

  const db = adminClient();
  const { data } = await db.from("plaid_items").select(PLAID_ITEM_COLUMNS).eq("item_id", item_id).maybeSingle();
  if (!data) return NextResponse.json({ ok: true, ignored: true });
  const item = data as PlaidItemRow;
  const setStatus = async (status: string, error: string | null) => {
    await db.from("plaid_items").update({ status, error }).eq("id", item.id);
    return NextResponse.json({ ok: true, status });
  };

  const sync =
    (type === "TRANSACTIONS" && (code === "SYNC_UPDATES_AVAILABLE" || code === "RECURRING_TRANSACTIONS_UPDATE")) || (type === "LIABILITIES" && code === "DEFAULT_UPDATE");
  if (sync) {
    const result = await syncItem(db, item);
    try {
      await refreshPlanFromLinked(db, item.user_id);
    } catch (e: any) {
      console.warn("refreshPlanFromLinked failed:", e?.message);
    }
    return NextResponse.json({ ok: true, result });
  }
  if (type === "ITEM") {
    switch (code) {
      case "ERROR":
        if (body.error?.error_code === "ITEM_LOGIN_REQUIRED") return setStatus("login_required", body.error.error_message ?? "The bank needs you to sign in again");
        break;
      case "PENDING_EXPIRATION":
        return setStatus("pending_expiration", `Bank access expires ${body.consent_expiration_time ?? "soon"}; reconnect to keep syncing`);
      case "PENDING_DISCONNECT":
        return setStatus("pending_expiration", `Bank access will be disconnected (${body.reason ?? "institution change"}); reconnect to keep syncing`);
      case "USER_PERMISSION_REVOKED":
        return setStatus("revoked", "Access was revoked at the bank");
      case "LOGIN_REPAIRED":
        return setStatus("ok", null);
    }
  }
  return NextResponse.json({ ok: true, ignored: true });
}
