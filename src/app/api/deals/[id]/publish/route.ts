import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import { v4 as uuidv4 } from "uuid";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { id, userId: user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { contactIds, channels } = await req.json();

  if (!contactIds || contactIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one contact" },
      { status: 400 }
    );
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, userId: user.id },
  });

  const recipients = [];

  for (const contact of contacts) {
    const decrypted = decryptContact(contact, user.encryptionKey);
    const selectedChannels = channels || ["email"];

    for (const channel of selectedChannels) {
      let hasChannel = false;
      if (channel === "email" && decrypted.email) hasChannel = true;
      if (channel === "sms" && decrypted.phone) hasChannel = true;
      if (channel === "whatsapp" && decrypted.whatsapp) hasChannel = true;

      if (hasChannel) {
        const accessToken = uuidv4();
        const recipient = await prisma.dealRecipient.create({
          data: {
            dealId: id,
            contactId: contact.id,
            accessToken,
            channel,
            sentAt: new Date(),
            status: "sent",
          },
        });
        recipients.push({
          ...recipient,
          contactName: decrypted.name,
          dealLink: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/deal/${accessToken}`,
        });
      }
    }
  }

  await prisma.deal.update({
    where: { id },
    data: { status: "published" },
  });

  return NextResponse.json({
    success: true,
    recipients,
    message: `Deal published to ${recipients.length} recipient(s). Share the deal links with your contacts.`,
  });
}
