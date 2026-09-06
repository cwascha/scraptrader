import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { generateEncryptionKey } from "@/lib/encryption";
import { wrapKey } from "@/lib/master-key";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// Registration is throttled two ways:
//   - per-IP (politeness limit; X-Forwarded-For is client-spoofable in
//     some topologies, so this alone is not a guarantee)
//   - a GLOBAL cap (spoof-proof backstop — this is a private single-tenant
//     app; more than a handful of signups an hour is an attack, and each
//     register burns a bcrypt cost-12 hash of CPU)
export async function POST(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const ipLimit = rateLimit(`register-ip:${clientIp(req)}`, 5, 60 * 60_000);
  const globalLimit = rateLimit("register:global", 20, 60 * 60_000);
  if (!ipLimit.ok || !globalLimit.ok) {
    const retry = Math.max(
      ipLimit.retryAfterSeconds,
      globalLimit.retryAfterSeconds
    );
    return NextResponse.json(
      { error: `Too many registration attempts — try again later` },
      { status: 429, headers: { "Retry-After": String(retry) } }
    );
  }

  let parsed: {
    email?: unknown;
    password?: unknown;
    name?: unknown;
    companyName?: unknown;
  };
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Length caps on stored fields (unbounded input shouldn't accumulate).
  // email: RFC-max 320; name/company: same generous cap as contacts.
  const email =
    typeof parsed.email === "string" ? parsed.email.trim().slice(0, 320) : "";
  const name =
    typeof parsed.name === "string" ? parsed.name.trim().slice(0, 200) : "";
  const companyName =
    typeof parsed.companyName === "string"
      ? parsed.companyName.trim().slice(0, 200)
      : "";
  const password = typeof parsed.password === "string" ? parsed.password : "";

  if (!email || !password || !name || !companyName) {
    return NextResponse.json(
      { error: "All fields are required" },
      { status: 400 }
    );
  }

  // Upper bound as well as lower: bcrypt only consumes the first 72 bytes,
  // so hashing a megabyte-long "password" is wasted CPU (a cheap DoS lever).
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json(
      { error: "Password must be between 8 and 200 characters" },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        companyName,
        passwordHash: await hashPassword(password),
        // Wrapped under the master key before it ever reaches the DB — a
        // stolen database alone can't decrypt this account's contacts.
        encryptionKey: wrapKey(generateEncryptionKey()),
      },
    });

    await createSession(user.id);

    return NextResponse.json({ success: true, userId: user.id });
  } catch (error) {
    // A unique-constraint race (two simultaneous signups with the same
    // email) surfaces as Prisma P2002 — return the same 400 as the
    // pre-check rather than leaking a generic 500.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }
    // Log the real error server-side; NEVER echo internals (paths, Prisma
    // messages, stack fragments) to an unauthenticated caller.
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Registration failed — please try again" },
      { status: 500 }
    );
  }
}
