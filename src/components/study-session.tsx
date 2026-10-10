"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { recordReview } from "@/app/(app)/flashcards/actions";
import { Button } from "@/components/form";
import { feedback, feedbackThenWin } from "@/lib/feedback";
import { rollLuckyBonus } from "@/lib/lucky-client";
import { permutation } from "@/lib/shuffle";

export type StudyCard = { id: string; term: string; definition: string };

// Shuffle into a new order (Fisher-Yates on a copy). Only runs in event handlers, never during render.
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Flip a card, then mark it known or still learning. Each mark writes one private review row.
// The first order comes from a seed the server sent, so the server render and the first client render match.
export function StudySession({ deckId, cards, label, seed }: { deckId: string; cards: StudyCard[]; label: string; seed: string }) {
  const [order, setOrder] = useState<StudyCard[]>(() => permutation(cards.length, seed).map((i) => cards[i]));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ known: 0, learning: 0 });
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const cardRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);

  const done = index >= order.length;
  const card = order[index];

  // After a mark the old button is gone, so move focus to the next card (or the round summary).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    (done ? doneRef.current : cardRef.current)?.focus();
  }, [index, done]);

  if (!cards.length) return null;

  const mark = (known: boolean) => {
    const id = card.id;
    const last = index + 1 >= order.length;
    // Inside the tap, so the browser lets the sound start: a ding for Know it, a soft pop for Still learning,
    // and the win chord after the last card of the round.
    const verdict = known ? "correct" : "wrong";
    if (last) feedbackThenWin(verdict);
    else feedback(verdict);
    moved.current = true;
    setError(null);
    setTally((t) => ({ known: t.known + (known ? 1 : 0), learning: t.learning + (known ? 0 : 1) }));
    setFlipped(false);
    setIndex((i) => i + 1);
    start(async () => {
      const result = await recordReview(id, known);
      if (result.error) setError("That mark didn't save. Check your connection.");
      // A finished round is a flashcards roll, once the last review is saved (the server checks for it).
      else if (last) void rollLuckyBonus("flashcards");
    });
  };

  const restart = (items: StudyCard[]) => {
    setOrder(shuffled(items));
    setIndex(0);
    setFlipped(false);
    setTally({ known: 0, learning: 0 });
    setError(null);
  };

  if (done) {
    return (
      <div className="grid max-w-xl gap-6">
        <p ref={doneRef} tabIndex={-1} className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-semibold uppercase outline-none">
          Round done
        </p>
        <p className="num text-[18px]">
          Know it: {tally.known} · Still learning: {tally.learning}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => restart(cards)}>Go again</Button>
          <Link href={`/flashcards/${deckId}`} className="caps step inline-flex h-12 items-center border border-ink px-6 text-[17px] hover:bg-band">
            Back to deck
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="caps num text-[15px] text-ink-2" aria-live="polite">
          {label} · {index + 1} of {order.length}
        </p>
        <button
          type="button"
          onClick={() => restart(cards)}
          className="caps step h-10 border border-rule-strong px-4 text-[15px] text-ink-2 hover:border-ink hover:text-ink"
        >
          Shuffle
        </button>
      </div>

      <button
        ref={cardRef}
        type="button"
        onClick={() => {
          setFlipped((f) => !f);
          feedback("flip");
        }}
        aria-label={flipped ? `Definition: ${card.definition}. Tap to show the term.` : `Term: ${card.term}. Tap to show the definition.`}
        className="step grid min-h-64 w-full place-items-center gap-3 border border-rule-strong bg-band px-6 py-10 text-center hover:border-ink"
      >
        {/* Keyed by face, so each tap turns the card over again. */}
        <span key={`${card.id}-${flipped}`} className="card-face grid place-items-center gap-3">
          <span className="caps text-[14px] text-ink-2">{flipped ? "Definition" : "Term"}</span>
          <span className="max-w-[40ch] break-words font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-tight font-semibold">
            {flipped ? card.definition : card.term}
          </span>
        </span>
      </button>

      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="line" onClick={() => mark(false)}>
            Still learning
          </Button>
          <Button onClick={() => mark(true)}>Know it</Button>
        </div>
      ) : (
        // Same height as the buttons that replace it, so nothing under the card jumps on a flip.
        <p className="flex min-h-12 items-center text-[15px] text-ink-2">Tap the card to see the definition.</p>
      )}

      {error ? <p role="alert" className="text-[15px] text-danger">{error}</p> : null}
    </div>
  );
}
