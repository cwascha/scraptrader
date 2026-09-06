"use client";

import { useEffect, useState, Fragment } from "react";
import { fetchJson } from "@/lib/fetch-json";

interface Group {
  id: string;
  name: string;
  contactIds: string[];
}

interface Contact {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  hasPortalToken: boolean;
  groups: { id: string; name: string }[];
}

type SortKey = "name" | "company" | "email" | "phone" | "whatsapp" | "groups";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  // null = the form is creating; an id = the form is editing that contact.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    whatsapp: "",
  });
  const [formGroupIds, setFormGroupIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [contactError, setContactError] = useState("");
  const [portalCopied, setPortalCopied] = useState<string | null>(null);
  // Which row has its portal actions expanded. Copy/Rotate/Revoke are one
  // concept (the portal token's lifecycle), so they collapse behind a
  // single control instead of eating five columns of row width.
  const [portalOpenFor, setPortalOpenFor] = useState<string | null>(null);

  // Sorting is CLIENT-SIDE by necessity, not by choice: name/company/email
  // /phone are stored encrypted, so the database has only ciphertext to
  // ORDER BY. The list can only be ordered once it's been decrypted.
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

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

  function closeForm() {
    setShowAdd(false);
    setEditingId(null);
    setForm({ name: "", company: "", email: "", phone: "", whatsapp: "" });
    setFormGroupIds([]);
    setContactError("");
  }

  function openCreate() {
    closeForm();
    setShowAdd(true);
  }

  function openEdit(c: Contact) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      company: c.company ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      whatsapp: c.whatsapp ?? "",
    });
    setFormGroupIds(c.groups.map((g) => g.id));
    setContactError("");
    setShowAdd(true);
    // The form sits above the table; bring it into view on long lists.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setContactError("");
    try {
      if (editingId) {
        // PUT keeps the contact's id — and therefore its portal token and
        // every deal/price-sheet thread attached to it. Delete-and-recreate
        // would silently orphan all of that.
        await fetchJson(`/api/contacts/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, groupIds: formGroupIds }),
        });
      } else {
        await fetchJson("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, groupIds: formGroupIds }),
        });
      }
      closeForm();
      await loadAll();
    } catch (err) {
      setContactError(
        err instanceof Error
          ? err.message
          : editingId
            ? "Failed to save changes"
            : "Failed to add contact"
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

  // Blank fields always sink to the bottom regardless of direction — a
  // screenful of "—" at the top is never what you wanted when you clicked
  // "Phone". Groups sorts by COUNT (finding ungrouped contacts is the
  // reason you'd click it), with name as the tiebreak.
  const collator = new Intl.Collator("en", {
    sensitivity: "base",
    numeric: true,
  });

  const sortedContacts = [...contacts].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;

    if (sortKey === "groups") {
      const diff = a.groups.length - b.groups.length;
      if (diff !== 0) return diff * dir;
      return collator.compare(a.name, b.name);
    }

    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    if (!av && !bv) return collator.compare(a.name, b.name);
    if (!av) return 1;
    if (!bv) return -1;
    return collator.compare(av, bv) * dir;
  });

  const sortHeader = (label: string, key: SortKey) => {
    const active = sortKey === key;
    return (
      <th className="text-left px-5 py-3">
        <button
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors ${
            active ? "text-brand" : "text-slate-500 hover:text-slate-700"
          }`}
          aria-sort={active ? (sortAsc ? "ascending" : "descending") : "none"}
        >
          {label}
          <span
            className={`text-[9px] ${active ? "opacity-100" : "opacity-30"}`}
            aria-hidden="true"
          >
            {active && !sortAsc ? "\u25b2" : "\u25bc"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            Contacts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Contact details are encrypted at rest under a key unique to your
            account &mdash; never sold, shared, or visible to another dealer.
          </p>
        </div>
        <button
          onClick={openCreate}
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
            {editingId ? "Edit Contact" : "Add Contact"}
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
                  Company
                </label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                  placeholder="e.g. Midwest Metals"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
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
                  inputMode="tel"
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
                  inputMode="tel"
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
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Save Contact"}
              </button>
              <button
                type="button"
                onClick={closeForm}
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
            onClick={openCreate}
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
                {sortHeader("Name", "name")}
                {sortHeader("Company", "company")}
                {sortHeader("Email", "email")}
                {sortHeader("Phone", "phone")}
                {sortHeader("WhatsApp", "whatsapp")}
                {sortHeader("Groups", "groups")}
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedContacts.map((c) => (
                <Fragment key={c.id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-sm font-medium text-slate-800">
                    {c.name}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {c.company || "—"}
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
                    <div className="flex gap-3 whitespace-nowrap justify-end items-center">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-brand hover:text-brand-dark text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          setPortalOpenFor(
                            portalOpenFor === c.id ? null : c.id
                          )
                        }
                        className="text-brand hover:text-brand-dark text-sm font-medium inline-flex items-center gap-1"
                        title="Copy, rotate, or revoke this buyer's portal link"
                      >
                        {portalCopied === c.id ? "✓ Copied!" : "Portal"}
                        <span className="text-[10px]" aria-hidden="true">
                          {portalOpenFor === c.id ? "▲" : "▼"}
                        </span>
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="btn-danger text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded inline rather than a dropdown: the table sits
                    in an overflow-x-auto container, which would clip an
                    absolutely-positioned menu. Also leaves room to say what
                    Rotate and Revoke actually do. */}
                {portalOpenFor === c.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={7} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500 mr-1">
                          Portal link — one page listing every deal sent to{" "}
                          {c.name}:
                        </span>
                        <button
                          onClick={() => handlePortalLink(c.id)}
                          className="px-2.5 py-1 text-sm font-medium text-brand border border-brand/30 rounded-md hover:bg-brand/5 transition-colors"
                        >
                          {portalCopied === c.id ? "✓ Copied" : "Copy link"}
                        </button>
                        {c.hasPortalToken && (
                          <>
                            <button
                              onClick={() => handleRotatePortal(c.id)}
                              className="px-2.5 py-1 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-white transition-colors"
                            >
                              Rotate
                              <span className="text-slate-400 ml-1.5">
                                new link, old one dies
                              </span>
                            </button>
                            <button
                              onClick={() => handleRevokePortal(c.id)}
                              className="px-2.5 py-1 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-white transition-colors"
                            >
                              Revoke
                              <span className="text-slate-400 ml-1.5">
                                no access until re-issued
                              </span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
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
                      className="btn-danger text-sm"
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
