import { passwordSchema } from "@/lib/password";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { db, failure, HttpError, sameOrigin, verify } from "@/lib/server";
import { requestPasswordReset } from "@/lib/password-recovery";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await req.json();
    const client = await supabaseServer();
    if (body.action === "request") {
      const email = z.string().trim().email().max(254).parse(body.email);
      return Response.json(
        await requestPasswordReset(email, new URL(req.url).origin),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.action !== "complete")
      throw new HttpError(400, "Unknown recovery action.");
    const password = passwordSchema.parse(body.password);
    if (password !== body.confirmPassword)
      throw new HttpError(400, "Passwords do not match.");
    const jar = await cookies();
    const proof = verify<{
      kind: string;
      userId: string;
      sessionId: string;
      exp: number;
    }>(jar.get("careline-recovery")?.value || "");
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    const { data } = await client.auth.getClaims();
    if (
      error ||
      !user ||
      user.is_anonymous ||
      proof.kind !== "recovery" ||
      proof.userId !== user.id ||
      proof.sessionId !== data?.claims.session_id
    )
      throw new HttpError(
        401,
        "This reset link has expired. Request a new one.",
      );
    const claimed = await db<boolean>("rpc/careline_claim_confirmation", {
      method: "POST",
      body: JSON.stringify({
        token_hash: createHash("sha256")
          .update(jar.get("careline-recovery")!.value)
          .digest("hex"),
      }),
    });
    if (!claimed)
      throw new HttpError(
        401,
        "This reset link has already been used. Request a new one.",
      );
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError)
      throw new HttpError(
        400,
        "Could not reset password. Choose a different password or request a new link.",
      );
    jar.delete("careline-recovery");
    await client.auth.signOut({ scope: "others" });
    return Response.json(
      { message: "Password updated. You can return to Clinic Assistant." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
