import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { assessmentRatelimit, prospectingRatelimit, isRatelimitEnabled } from "@/lib/ratelimit";

// Rate-limited API paths
const RATE_LIMITED_PATHS = {
  assessment: ["/api/assessment", "/api/battery-assessment"],
  prospecting: ["/api/prospecting"],
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Apply rate limiting for API endpoints
  if (isRatelimitEnabled()) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ??
               request.headers.get("x-real-ip") ??
               "anonymous";

    // Check assessment rate limit
    if (RATE_LIMITED_PATHS.assessment.some(path => pathname.startsWith(path))) {
      const result = await assessmentRatelimit?.limit(ip);
      if (result && !result.success) {
        return NextResponse.json(
          { error: "Demasiadas solicitudes. Por favor, espera unos segundos." },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": String(result.limit),
              "X-RateLimit-Remaining": String(result.remaining),
              "X-RateLimit-Reset": String(result.reset),
            },
          }
        );
      }
    }

    // Check prospecting rate limit
    if (RATE_LIMITED_PATHS.prospecting.some(path => pathname.startsWith(path))) {
      const result = await prospectingRatelimit?.limit(ip);
      if (result && !result.success) {
        return NextResponse.json(
          { error: "Demasiadas solicitudes. Por favor, espera unos segundos." },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": String(result.limit),
              "X-RateLimit-Remaining": String(result.remaining),
              "X-RateLimit-Reset": String(result.reset),
            },
          }
        );
      }
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Skip auth in development when SKIP_AUTH is enabled
  const skipAuth = process.env.SKIP_AUTH === "true";

  if (skipAuth) {
    return supabaseResponse;
  }

  // Check auth status
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes - redirect to login if not authenticated
  if (request.nextUrl.pathname.startsWith("/installer")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    // Verify user is an active installer
    const { data: installer } = await supabase
      .from("installers")
      .select("id, is_active, role")
      .eq("user_id", user.id)
      .single();

    if (!installer || !installer.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "no_access");
      return NextResponse.redirect(url);
    }
  }

  // If already logged in, redirect from login page to dashboard
  if (request.nextUrl.pathname === "/login" && user) {
    const { data: installer } = await supabase
      .from("installers")
      .select("id, is_active")
      .eq("user_id", user.id)
      .single();

    if (installer?.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = "/installer";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/installer/:path*",
    "/login",
    "/api/assessment/:path*",
    "/api/battery-assessment/:path*",
    "/api/prospecting/:path*",
  ],
};
