// Errors a service throws on purpose. API routes turn them into a JSON error
// with this status code; anything else is a real bug and becomes a 500.
import { NextResponse } from "next/server";

export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Use in a route's catch block. */
export function errorResponse(err: unknown) {
  if (err instanceof ServiceError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
