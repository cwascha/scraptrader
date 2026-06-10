import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { generateEncryptionKey } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, companyName } = await req.json();

    if (!email || !password || !name || !companyName) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

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
        encryptionKey: generateEncryptionKey(),
      },
    });

    await createSession(user.id);

    return NextResponse.json({ success: true, userId: user.id });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
