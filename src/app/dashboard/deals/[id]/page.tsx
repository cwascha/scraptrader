"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DealImage {
  id: string;
  url: string;
  filename: string;
}

interface Message {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  createdAt: string;
}

interface Recipient {
  id: string;
  accessToken: string;
  channel: string;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  contact: { id: string; encryptedName: string } | null;
  messages: Message[];
  _count: { messages: number };
}

interface Deal {
  id: string;
  title: string;
  metalType: string;
  description: string;
  quantity: string;
  unit: string;
  askingPrice: number | null;
  priceUnit: string;
  location: string | null;
  status: string;
  createdAt: string;
  images: DealImage[];
  recipients: Recipient[];
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
}

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPublish, setShowPublish] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["email"]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    recipients: { contactName: string; dealLink: string; channel: string }[];
  } | null>(null);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/deals/${id}`).then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
    ]).then(([dealData, contactData]) => {
      setDeal(dealData);
      setContacts(contactData);
      setLoading(false);
    });
  }, [id]);

  async function handlePublish() {
    setPublishing(true);
    const res = await fetch(`/api/deals/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactIds: selectedContacts,
        channels: selectedChannels,
      }),
    });
    const data = await res.json();
    setPublishing(false);
    if (res.ok) {
      setPublishResult(data);
      const updated = await fetch(`/api/deals/${id}`).then((r) => r.json());
      setDeal(updated);
    }
  }

  async function handleReply(recipientId: string) {
    if (!replyText.trim()) return;
    await fetch(`/api/deals/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId, content: replyText }),
    });
    setReplyText("");
    const updated = await fetch(`/api/deals/${id}`).then((r) => r.json());
    setDeal(updated);
  }

  async function handleDelete() {
    if (!confirm("Delete this deal? This cannot be undone.")) return;
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  if (loading || !deal) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading deal...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard"
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          &larr; Deals
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold text-slate-800">{deal.title}</h1>
        <span
          className={`ml-2 px-2.5 py-1 text-xs font-medium rounded-full ${
            deal.status === "published"
              ? "bg-green-100 text-green-700"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {deal.status}
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Deal details card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Deal Details
              </h2>
              <button
                onClick={handleDelete}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>

            {deal.images.length > 0 && (
              <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
                {deal.images.map((img) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt=""
                    className="w-32 h-32 object-cover rounded-lg border border-slate-200 flex-shrink-0"
                  />
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Metal Type</span>
                <p className="font-medium text-slate-800">{deal.metalType}</p>
              </div>
              <div>
                <span className="text-slate-500">Quantity</span>
                <p className="font-medium text-slate-800">
                  {deal.quantity} {deal.unit}
                </p>
              </div>
              {deal.askingPrice && (
                <div>
                  <span className="text-slate-500">Asking Price</span>
                  <p className="font-medium text-slate-800">
                    ${deal.askingPrice.toFixed(2)} {deal.priceUnit}
                  </p>
                </div>
              )}
              {deal.location && (
                <div>
                  <span className="text-slate-500">Location</span>
                  <p className="font-medium text-slate-800">{deal.location}</p>
                </div>
              )}
            </div>
            <div className="mt-4">
              <span className="text-sm text-slate-500">Description</span>
              <p className="text-slate-700 mt-1 whitespace-pre-wrap">
                {deal.description}
              </p>
            </div>
          </div>

          {/* Conversations */}
          {deal.recipients.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                Conversations ({deal.recipients.length})
              </h2>
              <div className="space-y-3">
                {deal.recipients.map((r) => (
                  <div key={r.id} className="border border-slate-200 rounded-lg">
                    <button
                      onClick={() =>
                        setActiveConversation(
                          activeConversation === r.id ? null : r.id
                        )
                      }
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <span className="font-medium text-slate-800">
                          Recipient via {r.channel}
                        </span>
                        <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                          <span>
                            Status:{" "}
                            <span
                              className={
                                r.status === "viewed"
                                  ? "text-green-600"
                                  : "text-slate-600"
                              }
                            >
                              {r.status}
                            </span>
                          </span>
                          <span>{r._count.messages} messages</span>
                        </div>
                      </div>
                      <span className="text-slate-400">
                        {activeConversation === r.id ? "▲" : "▼"}
                      </span>
                    </button>

                    {activeConversation === r.id && (
                      <div className="border-t border-slate-200 p-4">
                        <div className="mb-3 p-2 bg-slate-50 rounded text-xs text-slate-500">
                          Deal link:{" "}
                          <code className="bg-slate-200 px-1 rounded">
                            {window.location.origin}/deal/{r.accessToken}
                          </code>
                        </div>

                        <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                          {r.messages.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4">
                              No messages yet
                            </p>
                          ) : (
                            r.messages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`flex ${msg.senderType === "owner" ? "justify-end" : "justify-start"}`}
                              >
                                <div
                                  className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                                    msg.senderType === "owner"
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
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleReply(r.id);
                            }}
                            placeholder="Type a reply..."
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                          />
                          <button
                            onClick={() => handleReply(r.id)}
                            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Publish */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Publish Deal
            </h2>

            {publishResult ? (
              <div>
                <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg mb-4">
                  Deal published successfully!
                </div>
                <div className="space-y-3">
                  {publishResult.recipients.map((r, i) => (
                    <div
                      key={i}
                      className="p-3 bg-slate-50 rounded-lg text-sm"
                    >
                      <p className="font-medium text-slate-800">
                        {r.contactName}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        via {r.channel}
                      </p>
                      <div className="mt-2">
                        <p className="text-xs text-slate-400 mb-1">
                          Share this link:
                        </p>
                        <input
                          readOnly
                          value={r.dealLink}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setPublishResult(null);
                    setShowPublish(false);
                    setSelectedContacts([]);
                  }}
                  className="mt-4 w-full text-sm text-brand font-medium"
                >
                  Done
                </button>
              </div>
            ) : showPublish ? (
              <div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Select Contacts
                  </label>
                  {contacts.length === 0 ? (
                    <div className="text-sm text-slate-500 p-3 bg-slate-50 rounded-lg">
                      No contacts yet.{" "}
                      <Link
                        href="/dashboard/contacts"
                        className="text-brand font-medium"
                      >
                        Add contacts
                      </Link>{" "}
                      first.
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {contacts.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedContacts([
                                  ...selectedContacts,
                                  c.id,
                                ]);
                              } else {
                                setSelectedContacts(
                                  selectedContacts.filter((id) => id !== c.id)
                                );
                              }
                            }}
                            className="rounded border-slate-300"
                          />
                          <div className="text-sm">
                            <p className="font-medium text-slate-700">
                              {c.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {[c.email, c.phone, c.whatsapp]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Channels
                  </label>
                  <div className="space-y-1">
                    {["email", "sms", "whatsapp"].map((ch) => (
                      <label
                        key={ch}
                        className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedChannels.includes(ch)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedChannels([...selectedChannels, ch]);
                            } else {
                              setSelectedChannels(
                                selectedChannels.filter((c) => c !== ch)
                              );
                            }
                          }}
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-700 capitalize">
                          {ch === "sms" ? "SMS / Text" : ch}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handlePublish}
                    disabled={
                      publishing || selectedContacts.length === 0
                    }
                    className="flex-1 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 text-sm"
                  >
                    {publishing ? "Publishing..." : "Publish"}
                  </button>
                  <button
                    onClick={() => setShowPublish(false)}
                    className="px-4 py-2.5 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 mb-4">
                  Send this deal to your contacts. They&apos;ll receive a link
                  to view details and start a conversation.
                </p>
                <button
                  onClick={() => setShowPublish(true)}
                  className="w-full py-2.5 bg-accent text-brand-dark font-bold rounded-lg hover:bg-[#d49730] transition-colors"
                >
                  Publish to Contacts
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Stats
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Recipients</span>
                <span className="font-medium">{deal.recipients.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Viewed</span>
                <span className="font-medium">
                  {deal.recipients.filter((r) => r.viewedAt).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Messages</span>
                <span className="font-medium">
                  {deal.recipients.reduce(
                    (sum, r) => sum + r._count.messages,
                    0
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
