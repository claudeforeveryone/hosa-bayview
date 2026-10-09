"use client";

import { Plus } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { saveSelectionCard } from "@/app/(app)/flashcards/actions";
import { Button, Field, FormMessage, TextArea } from "@/components/form";
import { cleanSelection, prefillCard } from "@/lib/selection";

export type DeckOption = { id: string; title: string };

// Wraps a question's text. Select words in it and an "Add to flashcards" button appears under it.
// The sheet takes the selection as the term and the right answer as the definition; both can be edited.
export function SelectionCards({
  decks,
  answer,
  enabled,
  children,
}: {
  decks: DeckOption[];
  answer: string | null;
  enabled: boolean;
  children: ReactNode;
}) {
  const region = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [deck, setDeck] = useState("new");
  const [newDeck, setNewDeck] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Keeps the last usable selection, so the button is still there when the tap clears the highlight.
  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      const sel = window.getSelection();
      const el = region.current;
      if (!sel || sel.isCollapsed || !el) return;
      if (!el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return;
      setPicked(cleanSelection(sel.toString()));
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [enabled]);

  const open = () => {
    if (!picked) return;
    const pre = prefillCard(picked, answer);
    setTerm(pre.term);
    setDefinition(pre.definition);
    setDeck(decks[0]?.id ?? "new");
    setNewDeck("");
    setError(null);
    setSaved(null);
    sheet.current?.showModal();
  };

  const save = () => {
    setError(null);
    start(async () => {
      const r = await saveSelectionCard({
        deckId: deck,
        newDeckTitle: newDeck,
        term,
        definition,
      });
      if (r.error) return setError(r.error);
      if (r.fieldErrors)
        return setError(Object.values(r.fieldErrors)[0] ?? "Check the card.");
      const name =
        deck === "new"
          ? newDeck
          : (decks.find((d) => d.id === deck)?.title ?? "your deck");
      setSaved(name);
      sheet.current?.close();
    });
  };

  if (!enabled) return <>{children}</>;

  return (
    <div className="grid gap-3">
      <div ref={region}>{children}</div>
      {picked ? (
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={open}
          className="caps step inline-flex h-11 w-fit items-center gap-2 border border-ink px-4 text-[16px] hover:bg-band"
        >
          <Plus size={18} strokeWidth={2} aria-hidden />
          Add to flashcards
        </button>
      ) : null}
      {saved ? (
        <p role="status" className="text-[15px] text-ink-2">
          Saved to {saved}.
        </p>
      ) : null}

      <dialog
        ref={sheet}
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-lg border border-ink bg-ground p-0 text-ink backdrop:bg-ink/40"
      >
        <form
          className="grid gap-5 p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          noValidate
        >
          <h2
            id={titleId}
            className="font-display text-[26px] leading-none font-bold uppercase"
          >
            Add to flashcards
          </h2>
          <div className="grid gap-1.5">
            <label
              htmlFor={`${titleId}-deck`}
              className="text-[15px] font-medium"
            >
              Deck
            </label>
            <select
              id={`${titleId}-deck`}
              value={deck}
              onChange={(e) => setDeck(e.target.value)}
              className="step h-12 w-full border border-rule-strong bg-ground px-3 text-[17px] outline-none focus:border-ink"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
              <option value="new">New deck</option>
            </select>
          </div>
          {deck === "new" ? (
            <Field
              label="New deck name"
              name="newDeck"
              value={newDeck}
              onChange={(e) => setNewDeck(e.target.value)}
              maxLength={120}
              placeholder="Med terms"
            />
          ) : null}
          <TextArea
            label="Term"
            name="term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            maxLength={500}
            className="step min-h-20 w-full resize-y border border-rule-strong bg-transparent px-3 py-2.5 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
          />
          <TextArea
            label="Definition"
            name="definition"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            maxLength={2000}
            hint={
              answer
                ? "Filled from the right answer. Edit if you like."
                : "Write what it means."
            }
          />
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : "Save card"}
            </Button>
            <Button
              type="button"
              variant="line"
              onClick={() => sheet.current?.close()}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
