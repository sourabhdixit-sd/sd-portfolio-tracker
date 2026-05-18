import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Skip static Next.js assets
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/static/")
  ) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  const appPassword = process.env.NEXT_PUBLIC_APP_PASSWORD ?? process.env.APP_PASSWORD ?? "changeme";

  if (authHeader && authHeader.startsWith("Basic ")) {
    const base64Credentials = authHeader.slice("Basic ".length);
    let credentials: string;
    try {
      credentials = atob(base64Credentials);
    } catch {
      return unauthorizedResponse();
    }

    const colonIndex = credentials.indexOf(":");
    if (colonIndex !== -1) {
      const password = credentials.slice(colonIndex + 1);
      if (password === appPassword) {
        return NextResponse.next();
      }
    }
  }

  return unauthorizedResponse();
}

function unauthorizedResponse(): NextResponse {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="MF Tracker"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|static/).*)"],
};
