"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PACKAGING_OPTIONS,
  SHIPPING_TYPES,
  WEIGHT_UNITS,
  buildDealTitle,
} from "@/lib/deal-fields";
import { US_STATES } from "@/lib/us-states";
import MaterialSelect from "@/components/MaterialSelect";

// Keep in sync with /api/deals/[id]/images/route.ts (the server is authoritative).
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGES = 10;

interface YardAddress {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

type AddressFields = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

const emptyAddressFields: AddressFields = {
  street: "",
  city: "",
  state: "",
  zip: "",
};

function isPartialAddress(a: AddressFields): boolean {
  const filled = [a.street, a.city, a.state, a.zip]
    .map((v) => v.trim())
    .filter(Boolean).length;
  return filled > 0 && filled < 4;
}

// One reusable address block: autofill dropdown (from the shared Yard & Port
// list) plus manually editable fields.
function AddressBlock({
  title,
  value,
  onChange,
  savedAddresses,
}: {
  title: string;
  value: AddressFields;
  onChange: (v: AddressFields) => void;
  savedAddresses: YardAddress[];
}) {
  return (
    <div className="p-4 bg-slate-50 rounded-lg space-y-3">
      <label className="block text-sm font-medium text-slate-700">
        {title}{" "}
        <span className="font-normal text-slate-400">(optional)</span>
      </label>

      {savedAddresses.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            const addr = savedAddresses.find((a) => a.id === e.target.value);
            if (addr) {
              onChange({
                street: addr.street,
                city: addr.city,
                state: addr.state,
                zip: addr.zip,
              });
            }
          }}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
        >
          <option value="">Autofill from a saved address...</option>
          {savedAddresses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.street}, {a.city}, {a.state}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-slate-500">
          No saved addresses yet — add yards and ports in{" "}
          <Link href="/dashboard/settings" className="text-brand font-medium">
            Settings
          </Link>{" "}
          to autofill, or enter the address below.
        </p>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Street
        </label>
        <input
          type="text"
          value={value.street}
          onChange={(e) => onChange({ ...value, street: e.target.value })}
          placeholder="1200 Industrial Pkwy"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            City
          </label>
          <input
            type="text"
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            placeholder="Owego"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            State
          </label>
          <select
            value={value.state}
            onChange={(e) => onChange({ ...value, state: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
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
            Zip
          </label>
          <input
            type="text"
            value={value.zip}
            onChange={(e) => onChange({ ...value, zip: e.target.value })}
            placeholder="13827"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
          />
        </div>
      </div>
    </div>
  );
}

export default function NewDealPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    material: "",
    numLoads: "",
    weightPerLoad: "",
    weightUnit: "lbs",
    notes: "",
  });
  const [packaging, setPackaging] = useState<string[]>([]);
  const [shippingTypes, setShippingTypes] = useState<string[]>([]);
  const [pickup, setPickup] = useState<AddressFields>(emptyAddressFields);
  const [port, setPort] = useState<AddressFields>(emptyAddressFields);
  const [yardAddresses, setYardAddresses] = useState<YardAddress[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  // Set once the deal record exists, so a failed photo upload can be retried
  // without creating a duplicate deal.
  const [createdDealId, setCreatedDealId] = useState<string | null>(null);

  // Preload the user's preferred weight unit and saved yard/port addresses.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (me?.preferredWeightUnit) {
          setForm((f) => ({ ...f, weightUnit: me.preferredWeightUnit }));
        }
      })
      .catch(() => {});

    fetch("/api/yard-addresses")
      .then((r) => (r.ok ? r.json() : []))
      .then((addrs) => setYardAddresses(Array.isArray(addrs) ? addrs : []))
      .catch(() => {});
  }, []);

  function toggle(
    value: string,
    list: string[],
    setList: (v: string[]) => void
  ) {
    if (list.includes(value)) {
      setList(list.filter((v) => v !== value));
    } else {
      setList([...list, value]);
    }
  }

  const isDomestic = shippingTypes.includes("Domestic");
  const isExport = shippingTypes.includes("Export");

  const numLoadsNum = Number.parseInt(form.numLoads, 10);
  const weightNum = Number.parseFloat(form.weightPerLoad);
  const titlePreview =
    form.material && Number.isInteger(numLoadsNum) && numLoadsNum > 0 && weightNum > 0
      ? buildDealTitle({
          material: form.material,
          numLoads: numLoadsNum,
          weightPerLoad: weightNum,
          weightUnit: form.weightUnit,
          packaging,
        })
      : null;

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file after removal

    const problems: string[] = [];
    const accepted: File[] = [];

    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        problems.push(
          `${file.name}: unsupported type (use JPG, PNG, WebP, or GIF)`
        );
      } else if (file.size > MAX_FILE_SIZE) {
        problems.push(`${file.name}: over 10 MB`);
      } else {
        accepted.push(file);
      }
    }

    const room = MAX_IMAGES - images.length;
    if (accepted.length > room) {
      problems.push(
        `Deals are limited to ${MAX_IMAGES} photos — ${
          accepted.length - Math.max(room, 0)
        } file(s) skipped`
      );
      accepted.length = Math.max(room, 0);
    }

    setPhotoError(problems.join(". "));

    setImages((prev) => [...prev, ...accepted]);
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    setPhotoError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // MaterialSelect and checkbox groups can't use HTML `required` — validate here.
    if (!form.material) {
      setError("Select a material.");
      return;
    }
    if (packaging.length === 0) {
      setError("Select at least one packaging type.");
      return;
    }
    if (shippingTypes.length === 0) {
      setError("Select at least one shipping type.");
      return;
    }
    // Each address block: all four fields or none (mirrors the server rule).
    if (isDomestic && isPartialAddress(pickup)) {
      setError(
        "Pickup address must be complete (street, city, state, and zip) or left entirely blank."
      );
      return;
    }
    if (isExport && isPartialAddress(port)) {
      setError(
        "Port address must be complete (street, city, state, and zip) or left entirely blank."
      );
      return;
    }

    setLoading(true);

    let dealId = createdDealId;

    // Only create the deal if a previous attempt didn't already succeed.
    if (!dealId) {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: form.material,
          packaging,
          numLoads: form.numLoads,
          weightPerLoad: form.weightPerLoad,
          weightUnit: form.weightUnit,
          shippingTypes,
          notes: form.notes,
          ...(isDomestic
            ? {
                pickupStreet: pickup.street,
                pickupCity: pickup.city,
                pickupState: pickup.state,
                pickupZip: pickup.zip,
              }
            : {}),
          ...(isExport
            ? {
                portStreet: port.street,
                portCity: port.city,
                portState: port.state,
                portZip: port.zip,
              }
            : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create deal");
        setLoading(false);
        return;
      }

      const deal = await res.json();
      dealId = deal.id;
      setCreatedDealId(deal.id);
    }

    if (images.length > 0) {
      const formData = new FormData();
      images.forEach((img) => formData.append("images", img));
      const uploadRes = await fetch(`/api/deals/${dealId}/images`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        setError(
          `${
            data.error || "Photo upload failed."
          } The deal itself was saved — remove the problem photo(s) and press the button again to retry without duplicating the deal.`
        );
        setLoading(false);
        return;
      }
    }

    router.push(`/dashboard/deals/${dealId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">
        Create New Deal
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
      >
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Material *
          </label>
          <MaterialSelect
            value={form.material}
            onChange={(v) => setForm({ ...form, material: v })}
          />
          <p className="text-xs text-slate-400 mt-1">
            Official ISRI nonferrous categories. Pick a main category or expand
            it to choose a specific grade — hover a grade for its full spec.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Packaging *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PACKAGING_OPTIONS.map((p) => (
              <label
                key={p}
                className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ${
                  packaging.includes(p)
                    ? "border-brand bg-brand/5"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={packaging.includes(p)}
                  onChange={() => toggle(p, packaging, setPackaging)}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">{p}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Number of Loads *
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={form.numLoads}
            onChange={(e) => setForm({ ...form, numLoads: e.target.value })}
            placeholder="4"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Weight per Load *
          </label>
          <div className="flex gap-3">
            <input
              type="number"
              min={0}
              step="any"
              value={form.weightPerLoad}
              onChange={(e) =>
                setForm({ ...form, weightPerLoad: e.target.value })
              }
              placeholder="42000"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
              required
            />
            <select
              value={form.weightUnit}
              onChange={(e) =>
                setForm({ ...form, weightUnit: e.target.value })
              }
              className="w-40 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
            >
              {WEIGHT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Shipping Types *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SHIPPING_TYPES.map((s) => (
              <label
                key={s}
                className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ${
                  shippingTypes.includes(s)
                    ? "border-brand bg-brand/5"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={shippingTypes.includes(s)}
                  onChange={() => toggle(s, shippingTypes, setShippingTypes)}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">{s}</span>
              </label>
            ))}
          </div>
        </div>

        {isDomestic && (
          <AddressBlock
            title="Pickup Address (Yard)"
            value={pickup}
            onChange={setPickup}
            savedAddresses={yardAddresses}
          />
        )}

        {isExport && (
          <AddressBlock
            title="Port Address (Export)"
            value={port}
            onChange={setPort}
            savedAddresses={yardAddresses}
          />
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Material condition, grade, contaminants, preparation details, timing..."
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Photos{" "}
            <span className="font-normal text-slate-400">
              (JPG, PNG, WebP, or GIF · max 10 MB each · up to {MAX_IMAGES})
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            {previews.map((preview, i) => (
              <div key={i} className="relative w-24 h-24 group">
                <img
                  src={preview}
                  alt=""
                  className="w-full h-full object-cover rounded-lg border border-slate-200"
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors">
                <div className="text-center">
                  <div className="text-2xl text-slate-400">+</div>
                  <div className="text-xs text-slate-400">Add</div>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            )}
          </div>
          {photoError && (
            <p className="text-xs text-red-600 mt-2">{photoError}</p>
          )}
        </div>

        {titlePreview && (
          <div className="p-3 bg-slate-50 rounded-lg text-sm">
            <span className="text-slate-500">
              Your deal will be titled:{" "}
            </span>
            <span className="font-medium text-slate-800">{titlePreview}</span>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {loading
              ? "Saving..."
              : createdDealId
              ? "Retry Photo Upload"
              : "Create Deal"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 text-slate-600 font-medium rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
