"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/form";
import type { StudyCard } from "@/components/study-session";

const ROUND = 10;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

// Each round is a fresh subset in fresh orders. The round component is keyed, so a new round is a clean mount.
export function MatchGame({ deckId, cards }: { deckId: string; cards: StudyCard[] }) {
  const [round, setRound] = useState(0);
  if (!cards.length) return null;
  return <MatchRound key={round} deckId={deckId} cards={cards} onAgain={() => setRound((r) => r + 1)} />;
}

// Tap a term, then its definition. A right pair locks in; a wrong one flashes and clears.
function MatchRound({ deckId, cards, onAgain }: { deckId: string; cards: StudyCard[]; onAgain: () => void }) {
  const [layout] = useState(() => {
    const subset = shuffled(cards).slice(0, ROUND);
    return { total: subset.length, terms: shuffled(subset), defs: shuffled(subset) };
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<{ term: string; def: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");

  const { total } = layout;
  const finished = total > 0 && matched.size === total;

  // The clock runs from the first tap until the last pair locks in. Time is read in the effect, not the handlers.
  useEffect(() => {
    if (!running || finished) return;
    const began = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - began), 100);
    return () => clearInterval(t);
  }, [running, finished]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  const tapTerm = (id: string) => {
    if (matched.has(id) || finished) return;
    setRunning(true);
    setPicked(id);
    setMessage("");
  };

  const tapDef = (id: string) => {
    if (matched.has(id) || finished) return;
    setRunning(true);
    if (picked === null) {
      setMessage("Pick a term first.");
      return;
    }
    if (picked === id) {
      setMatched((m) => new Set(m).add(id));
      setPicked(null);
      setMessage("");
    } else {
      setFlash({ term: picked, def: id });
      setPicked(null);
      setMessage("Not that one.");
    }
  };

  if (finished) {
    return (
      <div className="grid max-w-xl gap-6">
        <p className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-semibold uppercase">Matched all {total}</p>
        <p className="num font-display text-[clamp(2.5rem,10vw,4rem)] leading-none font-bold">{seconds(elapsed)} s</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onAgain}>Play again</Button>
          <Link href={`/flashcards/${deckId}`} className="caps step inline-flex h-12 items-center border border-ink px-6 text-[17px] hover:bg-band">
            Back to deck
          </Link>
        </div>
      </div>
    );
  }

  const cell = (c: StudyCard, side: "term" | "def") => {
    const isMatched = matched.has(c.id);
    const isPicked = side === "term" && picked === c.id;
    const isFlash = flash !== null && (side === "term" ? flash.term === c.id : flash.def === c.id);
    return (
      <button
        key={`${side}-${c.id}`}
        type="button"
        onClick={() => (side === "term" ? tapTerm(c.id) : tapDef(c.id))}
        disabled={isMatched}
        aria-pressed={isPicked}
        className={`step grid min-h-20 place-items-center border px-2.5 py-2 text-center text-[16px] leading-snug break-words ${
          isMatched
            ? "border-ok bg-ok/15 text-ink-2"
            : isPicked
              ? "border-you bg-you text-on-you"
              : isFlash
                ? "border-danger text-danger"
                : "border-rule-strong hover:border-ink hover:bg-band"
        }`}
      >
        {side === "term" ? c.term : c.definition}
      </button>
    );
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="caps num text-[15px] text-ink-2">
          {matched.size} of {total} matched · {seconds(elapsed)} s
        </p>
        <button
          type="button"
          onClick={onAgain}
          className="caps step h-10 border border-rule-strong px-4 text-[15px] text-ink-2 hover:border-ink hover:text-ink"
        >
          New round
        </button>
      </div>
      <p className="min-h-6 text-[15px] text-ink-2" aria-live="polite">
        {message || "Tap a term, then its definition."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid content-start gap-2" role="group" aria-label="Terms">
          {layout.terms.map((c) => cell(c, "term"))}
        </div>
        <div className="grid content-start gap-2" role="group" aria-label="Definitions">
          {layout.defs.map((c) => cell(c, "def"))}
        </div>
      </div>
    </div>
  );
}
