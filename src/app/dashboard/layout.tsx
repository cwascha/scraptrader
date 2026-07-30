import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardNav } from "@/components/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // White-label theme: the Tailwind tokens (bg-brand, text-brand-dark,
  // bg-accent, ...) compile to var(--brand-primary) etc. (see globals.css),
  // so overriding those variables here re-themes every descendant.
  // themeMode === "dark" additionally applies the .theme-dark surface remap.
  const themeStyle = user.themeBrand
    ? ({
        "--brand-primary": user.themeBrand,
        "--brand-dark": user.themeBrandDark ?? user.themeBrand,
        "--brand-secondary": user.themeAccent ?? "#e8a838",
      } as React.CSSProperties)
    : undefined;

  const darkClass = user.themeMode === "dark" ? " theme-dark" : "";

  return (
    <div
      className={`min-h-screen bg-slate-50 flex flex-col${darkClass}`}
      style={themeStyle}
    >
      <DashboardNav
        userName={user.name}
        companyName={user.companyName}
        logoUrl={user.logoUrl}
      />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
