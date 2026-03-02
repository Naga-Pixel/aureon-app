import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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
  matcher: ["/installer/:path*", "/login"],
};
