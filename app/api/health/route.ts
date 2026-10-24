// GET /api/health: Infra's "is the server alive" check. Doesn't touch any service.
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
