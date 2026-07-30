"use client";

import { useEffect, useRef, useState } from "react";
import { MATERIAL_CATEGORIES, materialLabel } from "@/lib/materials";

// Custom dropdown for ISRI materials: 8 main categories as collapsible rows
// (all collapsed by default, so the 167-grade list never has to be scrolled
// blind). Clicking a category NAME selects the category itself; clicking the
// chevron expands it to show its ISRI-coded grades. Grade descriptions show
// as hover tooltips.
//
// The search box filters on code, grade name, AND description — dealers can
// type trade slang like "bare bright" (which only appears in Barley's spec)
// and still find the grade. While searching, matching categories auto-expand
// to their matching grades.
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
  const ref = useRef<HTMLDivElement>(null);

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
    setQuery(""); // fresh search every time the panel opens
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

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // While searching: a category is visible if its name matches or it has
  // matching grades, and its matching grades render auto-expanded. While
  // browsing: all categories visible, grades render only when expanded.
  const visibleCategories = MATERIAL_CATEGORIES.map((cat) => {
    if (!searching) {
      return {
        category: cat.category,
        totalCount: cat.items.length,
        items: expanded.includes(cat.category) ? cat.items : [],
        visible: true,
        showChevron: true,
        countLabel: `${cat.items.length}`,
      };
    }
    const catMatches = cat.category.toLowerCase().includes(q);
    const matchedItems = cat.items.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
    );
    return {
      category: cat.category,
      totalCount: cat.items.length,
      items: matchedItems,
      visible: catMatches || matchedItems.length > 0,
      showChevron: false,
      countLabel: `${matchedItems.length} match${matchedItems.length === 1 ? "" : "es"}`,
    };
  }).filter((c) => c.visible);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-left bg-white flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>
          {value ? materialLabel(value) : "Select material..."}
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
              placeholder="Search code, grade, or description..."
              autoFocus
              className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
            />
          </div>

          <div className="overflow-y-auto">
            {visibleCategories.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">
                No materials match &quot;{query.trim()}&quot;
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
                      } ${
                        value === cat.category
                          ? "text-brand"
                          : "text-slate-800"
                      }`}
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
                          key={`${cat.category}:${item.code}`}
                          type="button"
                          title={item.description}
                          onClick={() => select(item.code)}
                          className={`w-full text-left pl-9 pr-3 py-1.5 text-sm hover:bg-slate-50 ${
                            value === item.code
                              ? "bg-brand/5 text-brand"
                              : "text-slate-700"
                          }`}
                        >
                          <span className="font-medium">{item.code}</span>
                          <span className="text-slate-400">
                            {" "}
                            — {item.name}
                          </span>
                        </button>
                      ))}
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
