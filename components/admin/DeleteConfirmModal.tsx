"use client";

import { useEffect } from "react";
import type { AdminMenuItem } from "./types";

interface DeleteConfirmModalProps {
  item: AdminMenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

export default function DeleteConfirmModal({
  item,
  isOpen,
  onClose,
  onConfirm,
  deleting,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !deleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, deleting, onClose]);

  if (!isOpen || !item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/50 p-4 backdrop-blur-xs transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-roast/15 bg-foam p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-espresso">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </div>
          <div>
            <h3 id="delete-modal-title" className="text-base font-bold text-espresso">
              Delete Menu Item?
            </h3>
            <p className="text-xs text-roast">
              This will remove the item from the ordering system.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-roast/10 bg-cream/70 p-3.5 text-sm">
          <p className="font-bold text-espresso">{item.name}</p>
          <p className="text-xs text-roast mt-0.5">Category: {item.category}</p>
          {(item.sizes.length > 0 || item.addOns.length > 0) && (
            <p className="mt-1.5 text-xs text-roast/80">
              Includes {item.sizes.length} size(s) and {item.addOns.length} add-on(s).
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="rounded-full border border-roast/20 bg-foam px-4 py-2 text-xs font-semibold text-roast hover:bg-cream active:scale-95 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-5 py-2 text-xs font-bold text-foam shadow-sm hover:bg-red-800 active:scale-95 transition-all disabled:opacity-50"
          >
            {deleting ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Deleting…
              </>
            ) : (
              "Delete Item"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
