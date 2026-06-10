import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-5 py-2 text-sm font-medium text-brand hover:text-brand-dark transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-5 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-gradient-to-br from-[#2d5f8a] to-[#1a3a5c] text-white">
          <div className="max-w-6xl mx-auto px-6 py-24">
            <div className="max-w-2xl">
              <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
                The Private CRM for
                <span className="text-[#e8a838]"> Scrap Metal Trading</span>
              </h1>
              <p className="text-xl text-blue-100 mb-8 leading-relaxed">
                Publish deals to your contacts via email, text, or WhatsApp.
                Negotiate directly. Keep your contact list private and encrypted.
              </p>
              <div className="flex gap-4">
                <Link
                  href="/register"
                  className="px-8 py-3 bg-[#e8a838] text-[#1a3a5c] font-bold rounded-lg hover:bg-[#d49730] transition-colors text-lg"
                >
                  Start Trading
                </Link>
                <Link
                  href="/login"
                  className="px-8 py-3 border-2 border-white/30 text-white font-medium rounded-lg hover:bg-white/10 transition-colors text-lg"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-center mb-12 text-slate-800">
              How It Works
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: "1",
                  title: "Create a Deal",
                  desc: "Add material details, photos, pricing, and quantity. Everything a buyer needs to make a decision.",
                },
                {
                  step: "2",
                  title: "Publish to Contacts",
                  desc: "Select contacts and choose how to reach them — email, SMS, or WhatsApp. Each gets a unique deal link.",
                },
                {
                  step: "3",
                  title: "Negotiate & Close",
                  desc: "Buyers click the link to view details and start a conversation. No account needed. Negotiate price, confirm shipping, close the deal.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="text-center p-6"
                >
                  <div className="w-14 h-14 bg-brand text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-800">
                    {item.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-slate-50">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-center mb-12 text-slate-800">
              Your Data Stays Yours
            </h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {[
                {
                  title: "Encrypted Contact Lists",
                  desc: "All contact information is encrypted with AES-256. Even we can't read your contacts.",
                },
                {
                  title: "No Public Marketplace",
                  desc: "This is a private CRM, not an open market. Your deals only go to contacts you choose.",
                },
                {
                  title: "Account-Free for Buyers",
                  desc: "Your buyers never need to create an account. They interact through a simple link.",
                },
                {
                  title: "Secure Pass-Through",
                  desc: "ScrapTrader acts as a secure conduit. Your pricing and customer data stays in your hands.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-white p-6 rounded-xl border border-slate-200"
                >
                  <h3 className="text-lg font-semibold mb-2 text-slate-800">
                    {item.title}
                  </h3>
                  <p className="text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#1a3a5c] text-blue-200 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm">
          &copy; {new Date().getFullYear()} ScrapTrader. The private CRM and
          negotiating platform for scrap metal trading.
        </div>
      </footer>
    </div>
  );
}
