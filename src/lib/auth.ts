import { prisma } from "./db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// Refuse to run in production without a real JWT secret. The "dev-secret"
// fallback exists purely so local dev works before .env is set up — a
// production deployment signing sessions with a publicly known string
// would let anyone mint a valid session for any userId.
if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_SECRET) {
  throw new Error(
    "NEXTAUTH_SECRET must be set in production — refusing to start with the dev fallback secret."
  );
}

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "dev-secret"
);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return token;
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { userId: payload.userId as string };
  } catch {
    return null;
  }
}

// Returns the FULL user row — including `passwordHash` and
// `encryptionKey`. That's deliberate (routes need the key to decrypt
// contacts), but it makes this a loaded gun:
//
//   ⚠ NEVER return this object, or a spread of it, from a route.
//     `NextResponse.json(user)` or `{ ...user }` leaks the bcrypt hash
//     and the contact-decryption key in one line. Hand-pick fields — see
//     /api/auth/me for the pattern.
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  return prisma.user.findUnique({
    where: { id: session.userId },
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
