"use client";

import { useState } from "react";

type Section = {
  id: string;
  label: string;
  placeholder: string;
};

/**
 * Minimal section switcher stub used by the two pages so their two internal
 * sections are obvious. Tasks 8 and 9 replace the placeholder bodies with the
 * real Order Entry + Live Queue and Menu Management + Order History content.
 */
export default function SectionTabs({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sections"
        className="flex gap-1 border-b border-stone-200"
      >
        {sections.map((section) => {
          const isActive = section.id === active?.id;
          return (
            <button
              key={section.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActiveId(section.id)}
              className={
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors " +
                (isActive
                  ? "border-amber-800 text-amber-900"
                  : "border-transparent text-stone-500 hover:text-stone-800")
              }
            >
              {section.label}
            </button>
          );
        })}
      </div>

      <section className="mt-6" role="tabpanel" aria-label={active?.label}>
        <h2 className="text-lg font-semibold text-stone-900">
          {active?.label}
        </h2>
        <p className="mt-2 text-sm text-stone-500">{active?.placeholder}</p>
      </section>
    </div>
  );
}
