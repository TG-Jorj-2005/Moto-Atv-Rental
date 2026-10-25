import { NextResponse, type NextRequest } from "next/server";

// A NUL character in the path or the query can never be valid and PostgreSQL rejects it with an error, so such a
// request is answered 400 here instead of reaching a page or an API route as a server error.
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (/%00|\u0000/i.test(pathname) || /%00|\u0000/i.test(search)) {
    return new NextResponse("Bad request", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
