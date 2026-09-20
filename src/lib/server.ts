import { createHmac, timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { cookies } from "next/headers";
import { supabaseServer } from "./supabase";
import { HttpError } from "./http-error";
export { HttpError } from "./http-error";
export const databaseReady = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
export const liveReady = () =>
  Boolean(
    databaseReady() && process.env.OPENAI_API_KEY && process.env.SESSION_SECRET,
  );
export function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function sign(value: object) {
  const secret = process.env.SESSION_SECRET;
  if (!secret)
    throw new HttpError(503, "Booking confirmation is not configured.");
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function verify<T>(token: string): T {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw 0;
    const [body, signature] = parts;
    const expected = createHmac("sha256", process.env.SESSION_SECRET || "")
      .update(body)
      .digest("base64url");
    if (
      !process.env.SESSION_SECRET ||
      !signature ||
      !equal(signature, expected)
    )
      throw 0;
    const result = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof result.exp !== "number" || result.exp < Date.now()) throw 0;
    return result as T;
  } catch {
    throw new HttpError(401, "Confirmation expired. Please start again.");
  }
}
export type Session = {
  id: string;
  exp: number;
  email?: string;
  name: string;
  guest?: boolean;
  patientId?: string;
  role?: "patient" | "doctor";
  doctorId?: string;
  dateOfBirth?: string;
  gender?: string | null;
  phone?: string;
};
export async function session(): Promise<Session> {
  if (!databaseReady())
    throw new HttpError(503, "Accounts are not configured.");
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, "Please sign in to continue.");
  const { data: profile } = await supabase
    .from("careline_patients")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    exp: Date.now() + 30 * 60 * 1000,
    email: user.email,
    guest: Boolean(user.is_anonymous),
    role: profile?.account_type || "patient",
    doctorId: profile?.doctor_id || undefined,
    phone: profile?.phone || "",
    dateOfBirth: profile?.date_of_birth || "",
    gender: profile?.gender ?? null,
    patientId: user.user_metadata?.patient_id,
    name: String(profile?.full_name || user.user_metadata?.display_name || ""),
  };
}
export async function authorizeAI() {
  if (!liveReady())
    throw new HttpError(503, "The AI receptionist is not configured yet.");
  try {
    return await session();
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 401) throw e;
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInAnonymously();
  if (error)
    throw new HttpError(
      error.status === 429 ? 429 : 503,
      "Could not start a guest conversation. Please try again shortly.",
    );
  return session();
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    const host = req.headers.get("host") || new URL(req.url).host;
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== host)
      throw 0;
  } catch {
    throw new HttpError(403, "Cross-site request rejected.");
  }
}
export async function db<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!databaseReady())
    throw new HttpError(503, "Connect Supabase to enable appointments.");
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getSession();
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        ...(data.session
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {}),
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...options.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) {
    if (response.status === 409)
      throw new HttpError(
        409,
        "That appointment was just booked. Please choose another slot.",
      );
    if (response.status === 401 || response.status === 403)
      throw new HttpError(401, "Please sign in again.");
    console.error("Supabase request failed:", response.status);
    throw new HttpError(
      503,
      "The scheduling service is unavailable. Please try again.",
    );
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      {
        error: error.issues
          .map(
            (issue) => `${issue.path.join(".") || "Details"}: ${issue.message}`,
          )
          .join(" "),
      },
      { status: 400 },
    );
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Clinic Assistant request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
