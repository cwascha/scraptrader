"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

interface Group {
  id: string;
  name: string;
  contactIds: string[];
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  hasPortalToken: boolean;
  groups: { id: string; name: string }[];
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    whatsapp: "",
  });
  const [formGroupIds, setFormGroupIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [contactError, setContactError] = useState("");
  const [portalCopied, setPortalCopied] = useState<string | null>(null);

  // Groups section state
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [editingMembersOf, setEditingMembersOf] = useState<string | null>(null);
  const [memberDraft, setMemberDraft] = useState<string[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [contactData, groupData] = await Promise.all([
      fetchJson<Contact[]>("/api/contacts").catch(() => []),
      fetchJson<Group[]>("/api/contact-groups").catch(() => []),
    ]);
    setContacts(Array.isArray(contactData) ? contactData : []);
    setGroups(Array.isArray(groupData) ? groupData : []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setContactError("");
    try {
      await fetchJson("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, groupIds: formGroupIds }),
      });
      setForm({ name: "", email: "", phone: "", whatsapp: "" });
      setFormGroupIds([]);
      setShowAdd(false);
      await loadAll();
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Failed to add contact"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this contact?")) return;
    setContactError("");
    try {
      await fetchJson("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Failed to remove contact"
      );
    }
    await loadAll();
  }

  // Shared clipboard path for portal URLs (copy, and after a rotate).
  async function copyPortalUrl(contactId: string, portalToken: string) {
    const url = `${window.location.origin}/portal/${portalToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setPortalCopied(contactId);
      setTimeout(() => setPortalCopied(null), 2000);
    } catch {
      // Clipboard blocked (permissions/insecure context) — show the
      // link so it can be copied manually.
      window.prompt("Copy the portal link:", url);
    }
  }

  // Get-or-create the contact's portal link and copy it. The same token
  // comes back every time (channel-independent, one per buyer).
  async function handlePortalLink(contactId: string) {
    setContactError("");
    try {
      const { portalToken } = await fetchJson<{ portalToken: string | null }>(
        "/api/contacts/portal-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        }
      );
      if (!portalToken) {
        setContactError("Couldn't generate a portal link");
        return;
      }
      await copyPortalUrl(contactId, portalToken);
      await loadAll(); // a first-time mint flips hasPortalToken
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Failed to get the portal link"
      );
    }
  }

  // Rotate: the old link dies immediately. Used when a link may have
  // leaked. The new one lands on the clipboard ready to re-send.
  async function handleRotatePortal(contactId: string) {
    if (
      !confirm(
        "Rotate this buyer's portal link?\n\nTheir current link stops working immediately — you'll need to send them the new one (it'll be copied to your clipboard).\n\nNote: any individual deal pages they've already opened keep working."
      )
    )
      return;
    setContactError("");
    try {
      const { portalToken } = await fetchJson<{ portalToken: string | null }>(
        "/api/contacts/portal-link",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        }
      );
      if (!portalToken) {
        setContactError("Couldn't rotate the portal link");
        return;
      }
      await copyPortalUrl(contactId, portalToken);
      await loadAll();
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Failed to rotate the portal link"
      );
    }
  }

  // Revoke: no portal at all until a new token is minted (which happens
  // automatically on the next publish, or via Portal link).
  async function handleRevokePortal(contactId: string) {
    if (
      !confirm(
        "Revoke this buyer's portal link?\n\nIt stops working immediately and they lose the page listing your deals. A fresh link is created the next time you publish a deal to them, or when you copy their portal link.\n\nNote: any individual deal pages they've already opened keep working."
      )
    )
      return;
    setContactError("");
    try {
      await fetchJson("/api/contacts/portal-link", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      await loadAll();
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Failed to revoke the portal link"
      );
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setGroupError("");
    setCreatingGroup(true);
    try {
      const created = await fetchJson<Group>("/api/contact-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName }),
      });
      setGroups((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewGroupName("");
    } catch (err) {
      setGroupError(
        err instanceof Error ? err.message : "Failed to create group"
      );
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleDeleteGroup(id: string, name: string) {
    if (
      !confirm(
        `Delete the "${name}" group? The contacts in it are not deleted.`
      )
    )
      return;
    setGroupError("");
    try {
      await fetchJson("/api/contact-groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      setGroupError(
        err instanceof Error ? err.message : "Failed to delete group"
      );
      return;
    }
    if (editingMembersOf === id) setEditingMembersOf(null);
    setGroups((prev) => prev.filter((g) => g.id !== id));
    await loadAll(); // refresh group badges on contacts
  }

  function openMembersEditor(group: Group) {
    setEditingMembersOf(group.id);
    setMemberDraft(group.contactIds);
    setGroupError("");
  }

  async function handleSaveMembers(groupId: string) {
    setSavingMembers(true);
    setGroupError("");
    try {
      await fetchJson(`/api/contact-groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: memberDraft }),
      });
      setEditingMembersOf(null);
      await loadAll(); // refresh counts and badges
    } catch (err) {
      setGroupError(
        err instanceof Error ? err.message : "Failed to save members"
      );
    } finally {
      setSavingMembers(false);
    }
  }

  function toggleDraftMember(contactId: string) {
    setMemberDraft((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading contacts...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            Contacts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            All contact data is encrypted. Even ScrapTrader cannot read your
            contact list.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-5 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors flex-shrink-0"
        >
          + Add Contact
        </button>
      </div>

      {contactError && (
        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg mb-4">
          {contactError}
        </div>
      )}

      {/* Add Contact form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Add Contact
          </h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone (SMS)
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  WhatsApp Number
                </label>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) =>
                    setForm({ ...form, whatsapp: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                />
              </div>
            </div>
            {groups.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Groups
                </label>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <label
                      key={g.id}
                      className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg cursor-pointer text-sm transition-colors ${
                        formGroupIds.includes(g.id)
                          ? "border-brand bg-brand/5 text-brand"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formGroupIds.includes(g.id)}
                        onChange={() =>
                          setFormGroupIds((prev) =>
                            prev.includes(g.id)
                              ? prev.filter((id) => id !== g.id)
                              : [...prev, g.id]
                          )
                        }
                        className="rounded border-slate-300"
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Contact"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-6 py-2 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Contacts */}
      {contacts.length === 0 && !showAdd ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center mb-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            No contacts yet
          </h2>
          <p className="text-slate-600 mb-6">
            Add contacts to start publishing deals. All data is encrypted.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors"
          >
            Add First Contact
          </button>
        </div>
      ) : (
        // overflow-x-auto: on narrow screens the table scrolls inside this
        // card instead of stretching the whole page past the viewport.
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto mb-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Email
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Phone
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  WhatsApp
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Groups
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-sm font-medium text-slate-800">
                    {c.name}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {c.email || "—"}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {c.phone || "—"}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {c.whatsapp || "—"}
                  </td>
                  <td className="px-5 py-3">
                    {c.groups.length === 0 ? (
                      <span className="text-sm text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {c.groups.map((g) => (
                          <span
                            key={g.id}
                            className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full"
                          >
                            {g.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-3 whitespace-nowrap justify-end">
                      <button
                        onClick={() => handlePortalLink(c.id)}
                        className="text-brand hover:text-brand-dark text-sm font-medium"
                        title="Copy this buyer's portal link — one page listing every deal you've sent them"
                      >
                        {portalCopied === c.id ? "✓ Copied!" : "Portal link"}
                      </button>
                      {c.hasPortalToken && (
                        <>
                          <button
                            onClick={() => handleRotatePortal(c.id)}
                            className="text-slate-500 hover:text-slate-700 text-sm"
                            title="Mint a new portal link and kill the old one — use if the link may have leaked"
                          >
                            Rotate
                          </button>
                          <button
                            onClick={() => handleRevokePortal(c.id)}
                            className="text-slate-500 hover:text-slate-700 text-sm"
                            title="Kill this buyer's portal link entirely until a new one is issued"
                          >
                            Revoke
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-red-400 hover:text-red-600 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Groups */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Groups</h2>
        <p className="text-sm text-slate-500 mb-4">
          Organize buyers into groups (e.g. &quot;Copper&quot;). When
          publishing a deal you can select whole groups; overlaps are
          de-duplicated automatically.
        </p>

        {groupError && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg mb-3">
            {groupError}
          </div>
        )}

        <form onSubmit={handleCreateGroup} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New group name (e.g. Copper)"
            className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
          />
          <button
            type="submit"
            disabled={creatingGroup || !newGroupName.trim()}
            className="px-5 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {creatingGroup ? "Creating..." : "Create Group"}
          </button>
        </form>

        {groups.length === 0 ? (
          <p className="text-sm text-slate-400">No groups yet.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <div key={g.id} className="border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm">
                    <span className="font-medium text-slate-800">
                      {g.name}
                    </span>
                    <span className="text-slate-400 ml-2">
                      {g.contactIds.length} member
                      {g.contactIds.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() =>
                        editingMembersOf === g.id
                          ? setEditingMembersOf(null)
                          : openMembersEditor(g)
                      }
                      className="text-sm text-brand font-medium hover:text-brand-dark"
                    >
                      {editingMembersOf === g.id ? "Close" : "Members"}
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(g.id, g.name)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {editingMembersOf === g.id && (
                  <div className="border-t border-slate-200 p-4">
                    {contacts.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Add contacts first, then assign them to this group.
                      </p>
                    ) : (
                      <>
                        <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                          {contacts.map((c) => (
                            <label
                              key={c.id}
                              className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={memberDraft.includes(c.id)}
                                onChange={() => toggleDraftMember(c.id)}
                                className="rounded border-slate-300"
                              />
                              <span className="text-sm text-slate-700">
                                {c.name}
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveMembers(g.id)}
                            disabled={savingMembers}
                            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
                          >
                            {savingMembers
                              ? "Saving..."
                              : `Save (${memberDraft.length} member${
                                  memberDraft.length === 1 ? "" : "s"
                                })`}
                          </button>
                          <button
                            onClick={() => setEditingMembersOf(null)}
                            className="px-4 py-2 text-slate-600 text-sm rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
