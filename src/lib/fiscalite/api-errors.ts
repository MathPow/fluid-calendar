import { NextResponse } from "next/server";

/** Shape every error response from /api/fiscalite/* uses when the body is simple
 *  enough to translate on the client. `error` stays for logs; `errorKey` is what
 *  the UI actually renders through `t()`. */
export function fiscaliteError(
  errorKey: string,
  error: string,
  status: number
): NextResponse {
  return NextResponse.json({ errorKey, error }, { status });
}
