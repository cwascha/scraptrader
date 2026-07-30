"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WEIGHT_UNITS } from "@/lib/deal-fields";
import { US_STATES } from "@/lib/us-states";
import { extractThemeFromImage } from "@/lib/theme-extract";

interface YardAddress {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

const emptyAddress = { name: "", street: "", city: "", state: "", zip: "" };

const DEFAULT_THEME = {
  brand: "#2d5f8a",
  brandDark: "#1a3a5c",
  accent: "#e8a838",
};

export default function SettingsPage() {
  const router = useRouter();
  const [unit, setUnit] = useState("lbs");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [addresses, setAddresses] = useState<YardAddress[]>([]);
  const [addrForm, setAddrForm] = useState(emptyAddress);
  const [addingAddr, setAddingAddr] = useState(false);
  const [addrError, setAddrError] = useState("");

  // Branding / theme engine
  const [hasBranding, setHasBranding] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [colors, setColors] = useState(DEFAULT_THEME);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [extractNote, setExtractNote] = useState("");
  const [brandError, setBrandError] = useState("");
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandSaved, setBrandSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/yard-addresses").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([me, addrs]) => {
        if (me?.preferredWeightUnit) setUnit(me.preferredWeightUnit);
        if (me) {
          setLogoUrl(me.logoUrl ?? null);
          setMode(me.themeMode === "dark" ? "dark" : "light");
          if (me.themeBrand) {
            setHasBranding(true);
            setColors({
              brand: me.themeBrand,
              brandDark: me.themeBrandDark || me.themeBrand,
              accent: me.themeAccent || DEFAULT_THEME.accent,
            });
          }
        }
        setAddresses(Array.isArray(addrs) ? addrs : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");

    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredWeightUnit: unit }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save settings");
      return;
    }
    setSaved(true);
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBrandError("");
    setBrandSaved(false);
    setExtractNote("");
    setLogoFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // The theme engine: sample the logo and derive a palette. Heuristic —
    // the pickers below let the dealer adjust before saving. Grayscale
    // logos produce a matching neutral (charcoal/gray) theme.
    const extracted = await extractThemeFromImage(file);
    if (extracted) {
      setColors({
        brand: extracted.brand,
        brandDark: extracted.brandDark,
        accent: extracted.accent || colors.accent,
      });
      if (extracted.neutral) {
        setExtractNote(
          "Your logo is black/white, so we matched a neutral tone (accent kept for contrast). Adjust below, or pick any colors you like."
        );
      } else {
        setExtractNote(
          extracted.accent
            ? "Colors detected from your logo — adjust below if needed."
            : "Primary color detected from your logo (no distinct accent found — adjust below if needed)."
        );
      }
    } else {
      setExtractNote(
        "Couldn't detect any usable tone from this logo — pick your colors manually below."
      );
    }
  }

  async function handleSaveBranding() {
    setBrandSaving(true);
    setBrandError("");
    setBrandSaved(false);

    const formData = new FormData();
    formData.append("brand", colors.brand);
    formData.append("brandDark", colors.brandDark);
    formData.append("accent", colors.accent);
    formData.append("mode", mode);
    if (logoFile) formData.append("logo", logoFile);

    const res = await fetch("/api/branding", {
      method: "POST",
      body: formData,
    });

    setBrandSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBrandError(data.error || "Failed to save branding");
      return;
    }

    const data = await res.json();
    setLogoUrl(data.logoUrl ?? null);
    setLogoFile(null);
    setLogoPreview(null);
    setHasBranding(true);
    setBrandSaved(true);
    // Re-render the dashboard layout so the new theme applies immediately.
    router.refresh();
  }

  async function handleResetBranding() {
    if (
      !confirm(
        "Reset branding? Your logo, colors, and mode are removed and the default ScrapTrader theme returns — for you and on your deal links."
      )
    )
      return;
    await fetch("/api/branding", { method: "DELETE" });
    setLogoUrl(null);
    setLogoFile(null);
    setLogoPreview(null);
    setColors(DEFAULT_THEME);
    setMode("light");
    setHasBranding(false);
    setBrandSaved(false);
    setExtractNote("");
    router.refresh();
  }

  async function handleAddAddress(e: React.FormEvent) {
    e.preventDefault();
    setAddrError("");
    setAddingAddr(true);

    const res = await fetch("/api/yard-addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addrForm),
    });

    setAddingAddr(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAddrError(data.error || "Failed to add address");
      return;
    }

    const created = await res.json();
    setAddresses((prev) => [...prev, created]);
    setAddrForm(emptyAddress);
  }

  async function handleDeleteAddress(id: string) {
    if (!confirm("Delete this address? Deals that used it keep their copy."))
      return;
    await fetch("/api/yard-addresses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading settings...</div>
      </div>
    );
  }

  const shownLogo = logoPreview || logoUrl;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Settings</h1>

      {/* Preferences */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          Preferences
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          Defaults used when creating new deals.
        </p>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg mb-4">
            {error}
          </div>
        )}
        {saved && (
          <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg mb-4">
            Settings saved.
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Preferred Weight Unit
          </label>
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setSaved(false);
            }}
            className="w-48 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
          >
            {WEIGHT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Pre-selected for &quot;Weight per Load&quot; on new deals. You can
            still change it per deal.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Branding / theme engine */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Branding</h2>
        <p className="text-sm text-slate-500 mb-5">
          Upload your logo and the theme engine matches your colors — across
          your dashboard and every deal link you send. Buyers see your brand,
          not ours.
        </p>

        {brandError && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg mb-4">
            {brandError}
          </div>
        )}
        {brandSaved && (
          <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg mb-4">
            Branding saved — your dashboard and deal links now use your theme.
          </div>
        )}

        <div className="flex items-start gap-5 mb-5">
          <div className="flex-shrink-0">
            <div className="w-32 h-20 border border-slate-200 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden">
              {shownLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shownLogo}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span className="text-xs text-slate-400">No logo</span>
              )}
            </div>
          </div>
          <div className="flex-1">
            <label className="inline-block px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
              {shownLogo ? "Replace Logo" : "Upload Logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleLogoChange}
                className="hidden"
              />
            </label>
            <p className="text-xs text-slate-400 mt-2">
              PNG, JPEG, WebP, or GIF · max 5 MB. Colors are detected
              automatically (black/white logos get a matching neutral theme);
              adjust below before saving.
            </p>
            {extractNote && (
              <p className="text-xs text-brand mt-1">{extractNote}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          {(
            [
              ["brand", "Primary"],
              ["brandDark", "Primary Dark"],
              ["accent", "Accent"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors[key]}
                  onChange={(e) => {
                    setColors({ ...colors, [key]: e.target.value });
                    setBrandSaved(false);
                  }}
                  className="w-10 h-10 border border-slate-300 rounded cursor-pointer p-0.5 bg-white"
                />
                <span className="text-xs font-mono text-slate-500">
                  {colors[key]}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Light / dark mode */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-500 mb-2">
            Mode
          </label>
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
            {(["light", "dark"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setBrandSaved(false);
                }}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-brand text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m === "light" ? "☀ Light" : "☾ Dark"}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Applies to your dashboard AND your buyer-facing deal links — dark
            mode means buyers see your deals in dark too.
          </p>
        </div>

        {/* Live preview */}
        <div
          className="border border-slate-200 rounded-lg p-4 mb-5"
          style={
            mode === "dark" ? { backgroundColor: "#0f172a" } : undefined
          }
        >
          <p
            className="text-xs font-medium uppercase tracking-wide mb-3"
            style={{ color: mode === "dark" ? "#94a3b8" : "#94a3b8" }}
          >
            Preview — {mode} mode
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              className="px-5 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: colors.brand }}
            >
              Primary Button
            </button>
            <button
              type="button"
              className="px-5 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: colors.brandDark }}
            >
              Hover State
            </button>
            <span
              className="px-4 py-2 rounded-lg text-sm font-bold"
              style={{ backgroundColor: colors.accent, color: colors.brandDark }}
            >
              Accent
            </span>
            <span
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: `${colors.brand}${mode === "dark" ? "33" : "1a"}`,
                color: mode === "dark" ? "#e2e8f0" : colors.brand,
              }}
            >
              Active nav item
            </span>
            <span
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{
                backgroundColor: mode === "dark" ? "#1e293b" : "#ffffff",
                color: mode === "dark" ? "#e2e8f0" : "#1e293b",
                border: `1px solid ${mode === "dark" ? "#334155" : "#e2e8f0"}`,
              }}
            >
              Card surface
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSaveBranding}
            disabled={brandSaving}
            className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {brandSaving ? "Saving..." : "Save Branding"}
          </button>
          {(hasBranding || logoUrl) && (
            <button
              onClick={handleResetBranding}
              className="px-6 py-2.5 text-red-500 font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Reset to Default
            </button>
          )}
        </div>
      </div>

      {/* Yard & Port Addresses */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          Yard &amp; Port Addresses
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          Save the yards you ship from and the ports you export through. On
          deals, domestic pickups and export ports can both be autofilled from
          this list.
        </p>

        {addresses.length > 0 && (
          <div className="space-y-2 mb-6">
            {addresses.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-4 p-3 bg-slate-50 rounded-lg"
              >
                <div className="text-sm">
                  <p className="font-medium text-slate-800">{a.name}</p>
                  <p className="text-slate-500">
                    {a.street}, {a.city}, {a.state} {a.zip}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteAddress(a.id)}
                  className="text-sm text-red-500 hover:text-red-700 flex-shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddAddress} className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Add an Address
          </h3>

          {addrError && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
              {addrError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={addrForm.name}
              onChange={(e) =>
                setAddrForm({ ...addrForm, name: e.target.value })
              }
              placeholder="Main Yard, Port of Newark, ..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Street *
            </label>
            <input
              type="text"
              value={addrForm.street}
              onChange={(e) =>
                setAddrForm({ ...addrForm, street: e.target.value })
              }
              placeholder="1200 Industrial Pkwy"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                City *
              </label>
              <input
                type="text"
                value={addrForm.city}
                onChange={(e) =>
                  setAddrForm({ ...addrForm, city: e.target.value })
                }
                placeholder="Owego"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                State *
              </label>
              <select
                value={addrForm.state}
                onChange={(e) =>
                  setAddrForm({ ...addrForm, state: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                required
              >
                <option value="">State...</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Zip *
              </label>
              <input
                type="text"
                value={addrForm.zip}
                onChange={(e) =>
                  setAddrForm({ ...addrForm, zip: e.target.value })
                }
                placeholder="13827"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={addingAddr}
            className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {addingAddr ? "Adding..." : "Add Address"}
          </button>
        </form>
      </div>
    </div>
  );
}
