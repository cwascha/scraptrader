"use client";

import { useEffect, useRef, useState } from "react";
import {
  groupGrades,
  type MaterialGradeItem,
  type MaterialCategory,
} from "@/lib/materials";
import { fetchJson } from "@/lib/fetch-json";

// Material picker, backed by the YARD'S OWN grade list (/api/materials)
// rather than a static file. Categories are collapsible rows; clicking a
// category name selects the category itself (a mixed load), clicking the
// chevron expands it.
//
// Grades are per-user data now, so this component also lets the yard ADD a
// grade without leaving the deal form — the moment you need a grade that
// isn't listed is the moment you're creating a deal, and bouncing to a
// settings page to add it loses the form.
//
// Search filters on grade name and category. There's no description field
// any more: the grade names ARE the yard's own words, so there's nothing
// to translate.
export default function MaterialSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [grades, setGrades] = useState<MaterialGradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null); // category name
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const g = await fetchJson<MaterialGradeItem[]>("/api/materials");
      setGrades(Array.isArray(g) ? g : []);
    } catch {
      setGrades([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openPanel() {
    setQuery("");
    setAdding(null);
    setAddError("");
    setOpen(true);
  }

  function toggleCategory(name: string) {
    setExpanded((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  async function addGrade(category: string) {
    const name = newName.trim();
    if (!name) return;
    setAddError("");
    try {
      const created = await fetchJson<MaterialGradeItem>("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, name }),
      });
      await load();
      setNewName("");
      setAdding(null);
      // Adding a grade mid-deal almost always means you want it — select it.
      select(created.name);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't add that grade");
    }
  }

  const all: MaterialCategory[] = groupGrades(grades);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const visibleCategories = all
    .map((cat) => {
      if (!searching) {
        return {
          category: cat.category,
          items: expanded.includes(cat.category) ? cat.items : [],
          visible: true,
          showChevron: true,
          countLabel: `${cat.items.length}`,
        };
      }
      const catMatches = cat.category.toLowerCase().includes(q);
      const matched = cat.items.filter((i) =>
        i.name.toLowerCase().includes(q)
      );
      return {
        category: cat.category,
        items: matched,
        visible: catMatches || matched.length > 0,
        showChevron: false,
        countLabel: `${matched.length} match${matched.length === 1 ? "" : "es"}`,
      };
    })
    .filter((c) => c.visible);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-left bg-white flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>
          {value || (loading ? "Loading grades..." : "Select material...")}
        </span>
        <span className="text-slate-400 text-xs flex-shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-96 flex flex-col">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search grades..."
              autoFocus
              className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
            />
          </div>

          <div className="overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">
                Loading your grades...
              </p>
            ) : visibleCategories.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">
                {searching
                  ? `No grades match "${query.trim()}"`
                  : "No grades yet."}
              </p>
            ) : (
              visibleCategories.map((cat) => (
                <div
                  key={cat.category}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <div className="flex items-stretch">
                    {cat.showChevron && (
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.category)}
                        aria-label={`${
                          expanded.includes(cat.category)
                            ? "Collapse"
                            : "Expand"
                        } ${cat.category}`}
                        className="px-3 text-slate-400 hover:text-brand hover:bg-slate-50"
                      >
                        {expanded.includes(cat.category) ? "▾" : "▸"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => select(cat.category)}
                      className={`flex-1 text-left py-2 pr-3 text-sm font-medium hover:bg-slate-50 ${
                        cat.showChevron ? "" : "pl-3"
                      } ${value === cat.category ? "text-brand" : "text-slate-800"}`}
                    >
                      {cat.category}
                      <span className="text-slate-400 font-normal ml-1.5">
                        ({cat.countLabel})
                      </span>
                    </button>
                  </div>

                  {cat.items.length > 0 && (
                    <div className="pb-1">
                      {cat.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => select(item.name)}
                          className={`w-full text-left pl-9 pr-3 py-1.5 text-sm hover:bg-slate-50 ${
                            value === item.name
                              ? "bg-brand/5 text-brand"
                              : "text-slate-700"
                          }`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Add a grade to this category, in place. Only offered
                      while browsing — mid-search the category is filtered
                      and the affordance would be confusing. */}
                  {!searching && expanded.includes(cat.category) && (
                    <div className="pl-9 pr-3 pb-2">
                      {adding === cat.category ? (
                        <div className="flex gap-1.5">
                          <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addGrade(cat.category);
                              }
                            }}
                            placeholder="New grade name"
                            autoFocus
                            className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-brand"
                          />
                          <button
                            type="button"
                            onClick={() => addGrade(cat.category)}
                            className="px-2 py-1 bg-brand text-white text-xs font-medium rounded hover:bg-brand-dark"
                          >
                            Add
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAdding(cat.category);
                            setNewName("");
                            setAddError("");
                          }}
                          className="text-xs text-brand hover:text-brand-dark font-medium"
                        >
                          + Add grade to {cat.category}
                        </button>
                      )}
                      {addError && adding === cat.category && (
                        <p className="text-xs text-red-500 mt-1">{addError}</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
