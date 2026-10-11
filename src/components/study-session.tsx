"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { recordReview } from "@/app/(app)/flashcards/actions";
import { Button } from "@/components/form";
import { KeyHint, KeyLine } from "@/components/key-hint";
import { useAnswerKeys } from "@/hooks/use-answer-keys";
import { keysLine } from "@/lib/answer-keys";
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
// persist false (career flashcards) keeps the marks on this screen only: nothing is written to a deck.
export function StudySession({
  deckId,
  cards,
  label,
  seed,
  persist = true,
  backHref = `/flashcards/${deckId}`,
  backLabel = "Back to deck",
}: {
  deckId: string;
  cards: StudyCard[];
  label: string;
  seed: string;
  persist?: boolean;
  backHref?: string;
  backLabel?: string;
}) {
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

  const flip = () => {
    setFlipped((f) => !f);
    feedback("flip");
  };

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
    setTally((t) => ({
      known: t.known + (known ? 1 : 0),
      learning: t.learning + (known ? 0 : 1),
    }));
    setFlipped(false);
    setIndex((i) => i + 1);
    if (!persist) return;
    start(async () => {
      const result = await recordReview(id, known);
      if (result.error)
        setError("That mark didn't save. Check your connection.");
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

  // Enter or Space flips the card, as a tap does. Once it is flipped, 1 marks Still learning and 2 marks Know it.
  useAnswerKeys({
    enabled: cards.length > 0 && !done,
    options: flipped ? 2 : 0,
    onPick: (i) => mark(i === 1),
    onEnter: flip,
    onSpace: flip,
  });

  if (!cards.length) return null;

  if (done) {
    return (
      <div className="grid max-w-xl gap-6">
        <p
          ref={doneRef}
          tabIndex={-1}
          className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-semibold uppercase outline-none"
        >
          Round done
        </p>
        <p className="num text-[18px]">
          Know it: {tally.known} · Still learning: {tally.learning}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => restart(cards)}>Go again</Button>
          <Link href={backHref} className="caps step inline-flex h-12 items-center border border-ink px-6 text-[17px] hover:bg-band">
            {backLabel}
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
          className="caps step h-11 border border-rule-strong px-4 text-[15px] text-ink-2 hover:border-ink hover:text-ink"
        >
          Shuffle
        </button>
      </div>

      <button
        ref={cardRef}
        type="button"
        onClick={flip}
        aria-label={
          flipped
            ? `Definition: ${card.definition}. Tap to show the term.`
            : `Term: ${card.term}. Tap to show the definition.`
        }
        className={`step grid min-h-64 w-full place-items-center gap-3 border-[3px] px-6 py-10 text-center ${
          // The term is the navy field; turned over, the definition sits on the ice with an ink frame.
          flipped
            ? "border-ink bg-ground text-ink hover:bg-band"
            : "border-field bg-field text-on-field hover:bg-field-2 hover:border-field-2"
        }`}
      >
        {/* Keyed by face, so each tap turns the card over again. */}
        <span
          key={`${card.id}-${flipped}`}
          className="card-face grid place-items-center gap-3"
        >
          <span
            className={`caps text-[14px] ${flipped ? "text-ink-2" : "text-on-field-2"}`}
          >
            {flipped ? "Definition" : "Term"}
          </span>
          <span className="max-w-[40ch] break-words font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-tight font-semibold">
            {flipped ? card.definition : card.term}
          </span>
        </span>
      </button>

      <KeyLine text={keysLine("Space flip", "1-2 mark")} />

      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="line" onClick={() => mark(false)} aria-keyshortcuts="1">
            Still learning
            <KeyHint n={1} />
          </Button>
          <Button onClick={() => mark(true)} aria-keyshortcuts="2">
            Know it
            <KeyHint n={2} />
          </Button>
        </div>
      ) : (
        // Same height as the buttons that replace it, so nothing under the card jumps on a flip.
        <p className="flex min-h-12 items-center text-[15px] text-ink-2">
          Tap the card to see the definition.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
