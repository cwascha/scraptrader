// The yard's material grade vocabulary, used when creating deals.
//
// ISRI SPEC GRADES WERE REMOVED 2026-07-30. The ~180-code ISRI list was
// replaced by the grades a yard actually trades, in the yard's own words,
// grouped the way a price sheet is grouped. If formal ISRI codes are ever
// needed again (export contracts quote them), reintroduce them as an
// OPTIONAL cross-reference field on MaterialGrade rather than as the
// primary vocabulary — nobody picks "Taint/Tabor" from a dropdown.
//
// SINGLE SOURCE OF TRUTH: the grade names and their grouping come from
// STARTER_ITEMS — the same list that seeds a new price sheet. Deals and
// price sheets therefore speak the same vocabulary by construction, which
// is the whole point: "Romex" means the same thing on both sides.
//
// This file only supplies DEFAULTS. The live list is per-user rows in the
// MaterialGrade table, seeded from here on first read and extended by the
// yard (see /api/materials).

import { STARTER_ITEMS } from "./price-sheet-defaults";

export interface GradeSeed {
  category: string;
  name: string;
}

// Derived, not duplicated — editing STARTER_ITEMS updates both.
export const DEFAULT_GRADES: GradeSeed[] = STARTER_ITEMS.map((i) => ({
  category: i.category,
  name: i.name,
}));

// Category order for a freshly seeded list. Taken from the order grades
// appear in STARTER_ITEMS so the dropdown matches the printed sheet.
export const DEFAULT_CATEGORIES: string[] = Array.from(
  new Set(DEFAULT_GRADES.map((g) => g.category))
);

export interface MaterialGradeItem {
  id: string;
  category: string;
  name: string;
}

export interface MaterialCategory {
  category: string;
  items: MaterialGradeItem[];
}

// Group a flat grade list into categories, preserving the order the rows
// arrive in (the API sorts by category then sortOrder).
export function groupGrades(
  grades: MaterialGradeItem[]
): MaterialCategory[] {
  const out: MaterialCategory[] = [];
  for (const g of grades) {
    let cat = out.find((c) => c.category === g.category);
    if (!cat) {
      cat = { category: g.category, items: [] };
      out.push(cat);
    }
    cat.items.push(g);
  }
  return out;
}

// Display label for a stored Deal.material value.
//
// Now an identity function: the stored value IS the grade name a human
// chose ("Romex", "Clean Auto Rads"), not an opaque code needing a lookup
// table. Kept as a function because call sites shouldn't have to care, and
// because a future cross-reference field would render here.
export function materialLabel(value: string): string {
  return value;
}

// Field caps for user-added grades.
export const MAX_GRADE_NAME = 80;
export const MAX_GRADE_CATEGORY = 60;
// A yard with 400 grades has a data-entry problem, not a vocabulary.
export const MAX_GRADES_PER_USER = 400;
