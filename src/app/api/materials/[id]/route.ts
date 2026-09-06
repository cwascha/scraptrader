import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// DELETE — remove a grade from the yard's list.
//
// Deals that already used it are UNAFFECTED: Deal.material holds the name
// as a snapshot, not a foreign key. The grade disappears from the picker;
// existing deals keep displaying it. That's deliberate — a yard should be
// able to retire a grade without rewriting its own history.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // deleteMany doubles as the ownership check — a non-owner matches zero
  // rows rather than deleting someone else's grade.
  const result = await prisma.materialGrade.deleteMany({
    where: { id, userId: user.id },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Grade not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
