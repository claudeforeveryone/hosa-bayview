"use client";

import { useMemo, useState, useTransition } from "react";
import { addCards, deleteCard, updateCard } from "@/app/(app)/flashcards/actions";
import type { FormState } from "@/app/(app)/c/actions";
import { Button, FormMessage } from "@/components/form";
import { ConfirmAction } from "@/components/confirm-action";
import type { Card } from "@/lib/decks";
import { parseCards, MAX_CARDS_PER_PASTE } from "@/lib/parse/cards";

const EXAMPLE = "Femur - longest bone in the body\nTibia: shin bone\nUlna\tforearm bone";

// Card list for editors and viewers, with single add, bulk paste (previewed first), and edit/delete for editors.
export function DeckCards({ deckId, cards, canEdit }: { deckId: string; cards: Card[]; canEdit: boolean }) {
  return (
    <div className="grid gap-8">
      {canEdit ? <AddCards deckId={deckId} /> : null}
      {cards.length ? (
        <ol id="deck-cards-list" tabIndex={-1} className="border-t border-rule">
          {cards.map((c) => (
            <CardRow key={c.id} card={c} canEdit={canEdit} />
          ))}
        </ol>
      ) : (
        <p className="text-[17px] text-ink-2">No cards yet.</p>
      )}
    </div>
  );
}

function AddCards({ deckId }: { deckId: string }) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const parsed = useMemo(() => parseCards(text), [text]);
  const over = parsed.items.length > MAX_CARDS_PER_PASTE;

  const send = (items: { term: string; definition: string }[], clear: () => void) => {
    setMessage(null);
    start(async () => {
      const result = await addCards(deckId, items);
      if (result.error) setMessage({ tone: "error", text: result.error });
      else {
        setMessage({ tone: "ok", text: result.ok ?? "Added." });
        clear();
      }
    });
  };

  return (
    <div className="grid gap-8">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          send([{ term: term.trim(), definition: definition.trim() }], () => {
            setTerm("");
            setDefinition("");
          });
        }}
      >
        <label className="grid gap-1.5 text-[15px] font-medium">
          Term
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            maxLength={500}
            required
            className="step h-12 border border-rule-strong bg-transparent px-3 text-[17px] font-normal outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
          />
        </label>
        <label className="grid gap-1.5 text-[15px] font-medium">
          Definition
          <input
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            maxLength={2000}
            required
            className="step h-12 border border-rule-strong bg-transparent px-3 text-[17px] font-normal outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
          />
        </label>
        <Button type="submit" variant="line" disabled={pending || !term.trim() || !definition.trim()}>
          Add card
        </Button>
      </form>

      <div className="grid gap-3 border-t border-rule pt-6">
        <label htmlFor="bulk-cards" className="text-[15px] font-medium">
          Paste many
        </label>
        <textarea
          id="bulk-cards"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMessage(null);
          }}
          rows={6}
          spellCheck={false}
          placeholder={EXAMPLE}
          className="step min-h-36 w-full resize-y border border-rule-strong bg-transparent px-3 py-2.5 text-[16px] leading-relaxed outline-none placeholder:text-ink-2/70 focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
        />
        <p className="text-[15px] text-ink-2">One card per line: term then definition, split by a tab, a spaced hyphen, a spaced dash or a colon.</p>
        {text.trim() ? (
          <div className="grid gap-3">
            <p className="caps text-[15px] text-ink-2" aria-live="polite">
              {parsed.items.length} ready{parsed.errors.length ? ` · ${parsed.errors.length} to fix` : ""}
            </p>
            <ul className="grid border-t border-rule">
              {parsed.items.map((c) => (
                <li key={c.line} className="grid gap-0.5 border-b border-rule py-2.5 text-[16px]">
                  <span className="font-semibold">{c.term}</span>
                  <span className="text-ink-2">{c.definition}</span>
                </li>
              ))}
              {parsed.errors.map((e) => (
                <li key={`e${e.line}`} className="grid gap-0.5 border-b border-danger py-2.5 text-[16px]">
                  <span className="text-danger">Line {e.line}: {e.message}</span>
                  <span className="text-ink-2 break-words">{e.text}</span>
                </li>
              ))}
            </ul>
            {over ? (
              <p className="text-[15px] text-danger">Add at most {MAX_CARDS_PER_PASTE} cards at a time. Split the list.</p>
            ) : null}
            <div>
              <Button
                type="button"
                disabled={pending || !parsed.items.length || over || parsed.errors.length > 0}
                onClick={() => send(parsed.items.map((c) => ({ term: c.term, definition: c.definition })), () => setText(""))}
              >
                {pending ? "Adding" : `Add ${parsed.items.length} card${parsed.items.length === 1 ? "" : "s"}`}
              </Button>
              {parsed.errors.length ? <p className="mt-2 text-[15px] text-ink-2">Fix the lines marked above to add them all.</p> : null}
            </div>
          </div>
        ) : null}
      </div>
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
    </div>
  );
}

function CardRow({ card, canEdit }: { card: Card; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [term, setTerm] = useState(card.term);
  const [definition, setDefinition] = useState(card.definition);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <li className="grid gap-3 border-b border-rule py-4">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("term", term);
            fd.set("definition", definition);
            start(async () => {
              const result = await updateCard(card.id, {}, fd);
              setState(result);
              if (!result.error) setEditing(false);
            });
          }}
        >
          <input
            aria-label="Term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            maxLength={500}
            required
            className="step h-12 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink"
          />
          <textarea
            aria-label="Definition"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            maxLength={2000}
            required
            rows={2}
            className="step border border-rule-strong bg-transparent px-3 py-2 text-[17px] outline-none focus:border-ink"
          />
          {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : "Save"}
            </Button>
            <Button
              type="button"
              variant="line"
              disabled={pending}
              onClick={() => {
                // Back to the saved card, not whatever was typed.
                setTerm(card.term);
                setDefinition(card.definition);
                setState({});
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="grid gap-3 border-b border-rule py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="grid min-w-0 gap-0.5">
        <span className="break-words font-semibold">{card.term}</span>
        <span className="break-words text-ink-2">{card.definition}</span>
      </div>
      {canEdit ? (
        <div role="group" aria-label={`Card: ${card.term}`} className="flex flex-wrap items-start gap-3">
          <Button variant="line" className="h-10 px-4 text-[15px]" aria-label={`Edit ${card.term}`} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <ConfirmAction
            action={() => deleteCard(card.id)}
            label="Delete"
            confirmLabel="Delete card"
            pendingLabel="Deleting"
            question="Delete this card?"
            compact
            focusAfter="deck-cards-list"
          />
        </div>
      ) : null}
    </li>
  );
}
