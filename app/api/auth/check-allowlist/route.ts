import { NextResponse } from "next/server";
import { isAllowedEmail, parseAllowedEmails } from "@/lib/auth";

export const runtime = "nodejs";

// Allowlist precheck so the /login page can short-circuit BEFORE asking
// Supabase to send a magic link. Vague 200/403 — never confirms which
// emails are or aren't on the list to anyone fishing for invites.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const email = (body as { email?: string })?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  const allowed = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  if (!isAllowedEmail(email, allowed)) {
    return NextResponse.json(
      { error: "not invited — ask Diogo for access" },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
