"use client";

import { useEffect, useState, use, useRef } from "react";
import { Logo } from "@/components/Logo";

interface DealImage {
  id: string;
  url: string;
}

interface Message {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  createdAt: string;
}

interface DealData {
  deal: {
    title: string;
    metalType: string;
    description: string;
    quantity: string;
    unit: string;
    askingPrice: number | null;
    priceUnit: string;
    location: string | null;
    images: DealImage[];
    company: string;
    seller: string;
    createdAt: string;
  };
  messages: Message[];
  recipientId: string;
}

export default function PublicDealPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<DealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [nameSet, setNameSet] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/public/deal/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  async function refreshMessages() {
    const msgs = await fetch(`/api/public/deal/${token}/messages`).then((r) =>
      r.json()
    );
    if (data) {
      setData({ ...data, messages: msgs });
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !name.trim()) return;

    setSending(true);
    await fetch(`/api/public/deal/${token}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, senderName: name }),
    });
    setMessage("");
    setSending(false);
    setNameSet(true);
    await refreshMessages();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading deal...</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Logo className="justify-center mb-6" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Deal Not Found
          </h1>
          <p className="text-slate-600">
            This deal link may have expired or is invalid.
          </p>
        </div>
      </div>
    );
  }

  const { deal, messages } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Logo />
          <span className="text-sm text-slate-500">
            Offered by {deal.company}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            {/* Deal info */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h1 className="text-2xl font-bold text-slate-800 mb-1">
                {deal.title}
              </h1>
              <p className="text-brand font-medium">{deal.company}</p>

              {deal.images.length > 0 && (
                <div className="mt-4">
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {deal.images.map((img) => (
                      <img
                        key={img.id}
                        src={img.url}
                        alt=""
                        className="w-40 h-40 object-cover rounded-lg border border-slate-200 flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setSelectedImage(img.url)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500">Metal Type</span>
                  <p className="font-semibold text-slate-800">
                    {deal.metalType}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500">Quantity</span>
                  <p className="font-semibold text-slate-800">
                    {deal.quantity} {deal.unit}
                  </p>
                </div>
                {deal.askingPrice && (
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-slate-500">Asking Price</span>
                    <p className="font-semibold text-slate-800">
                      ${deal.askingPrice.toFixed(2)} {deal.priceUnit}
                    </p>
                  </div>
                )}
                {deal.location && (
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-slate-500">Location</span>
                    <p className="font-semibold text-slate-800">
                      {deal.location}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium text-slate-500 mb-2">
                  Description
                </h3>
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {deal.description}
                </p>
              </div>
            </div>
          </div>

          {/* Chat panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden sticky top-6">
              <div className="bg-brand text-white px-4 py-3">
                <h2 className="font-semibold">Chat with {deal.seller}</h2>
                <p className="text-xs text-blue-100">
                  Ask questions, negotiate, or confirm details
                </p>
              </div>

              <div className="h-80 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-8">
                    <p>Start a conversation about this deal.</p>
                    <p className="mt-1 text-xs">
                      Ask about material condition, negotiate pricing, or
                      discuss shipping.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderType === "buyer" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                          msg.senderType === "buyer"
                            ? "bg-brand text-white"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        <p className="font-medium text-xs opacity-70 mb-0.5">
                          {msg.senderName}
                        </p>
                        <p>{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form
                onSubmit={handleSend}
                className="border-t border-slate-200 p-4 space-y-2"
              >
                {!nameSet && (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                    required
                  />
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                    required
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Image lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}

      <footer className="bg-white border-t border-slate-200 py-4 mt-12">
        <div className="max-w-4xl mx-auto px-6 text-center text-xs text-slate-400">
          Powered by ScrapTrader &mdash; The private CRM for scrap metal trading
        </div>
      </footer>
    </div>
  );
}
