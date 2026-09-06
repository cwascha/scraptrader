import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword, createSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// Timing equalizer: without this, "email not found" returns in ~1ms while
// "wrong password" takes a full bcrypt compare (~200ms at cost 12) — a
// measurable oracle for enumerating which emails have accounts. When the
// user doesn't exist we compare against a cached dummy hash so both paths
// cost one bcrypt compare. (First call pays one extra hash to build it.)
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await hashPassword("timing-equalizer-pad");
  return dummyHash;
}

export async function POST(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  let parsed: { email?: unknown; password?: unknown };
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const email = typeof parsed.email === "string" ? parsed.email : "";
  const password = typeof parsed.password === "string" ? parsed.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Two throttle keys: per-IP (politeness; X-Forwarded-For can be spoofed
  // in some topologies) and per-EMAIL (spoof-proof — an attacker can fake
  // their address but not the account they're attacking).
  const ipLimit = rateLimit(`login-ip:${clientIp(req)}`, 15, 5 * 60_000);
  const emailLimit = rateLimit(
    `login-email:${String(email).toLowerCase()}`,
    5,
    5 * 60_000
  );
  if (!ipLimit.ok || !emailLimit.ok) {
    const retry = Math.max(
      ipLimit.retryAfterSeconds,
      emailLimit.retryAfterSeconds
    );
    return NextResponse.json(
      { error: "Too many login attempts — try again in a few minutes" },
      { status: 429, headers: { "Retry-After": String(retry) } }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyPassword(password, await getDummyHash());
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  await createSession(user.id);

  return NextResponse.json({ success: true, userId: user.id });
}
