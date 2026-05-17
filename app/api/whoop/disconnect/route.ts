import { NextResponse } from "next/server";
import { disconnect } from "@/lib/whoop";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

export async function POST() {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }
  try {
    await disconnect(userId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "disconnect failed" }, { status: 500 });
  }
}
