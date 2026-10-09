"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/form";
import type { StudyCard } from "@/components/study-session";
import { permutation } from "@/lib/shuffle";

const ROUND = 10;

const seconds = (ms: number) => (ms / 1000).toFixed(1);

// A round is a subset of cards in orders derived from the seed and round number. Same inputs, same layout,
// so the server render and the first client render match, and nothing random runs during render.
export function layoutFor(cards: StudyCard[], seed: string, round: number) {
  const key = `${seed}:${round}`;
  const subset = permutation(cards.length, `${key}:pick`)
    .slice(0, ROUND)
    .map((i) => cards[i]);
  return {
    total: subset.length,
    terms: permutation(subset.length, `${key}:terms`).map((i) => subset[i]),
    defs: permutation(subset.length, `${key}:defs`).map((i) => subset[i]),
  };
}

// A term and a definition cell pair when their text is equal. Ids don't matter, so duplicate definitions all count.
export function pairsWith(term: StudyCard, def: StudyCard): boolean {
  return term.definition === def.definition;
}

// Each round is a fresh subset in fresh orders. The round component is keyed, so a new round is a clean mount.
export function MatchGame({ deckId, cards, seed }: { deckId: string; cards: StudyCard[]; seed: string }) {
  const [round, setRound] = useState(0);
  if (!cards.length) return null;
  return (
    <MatchRound
      key={round}
      deckId={deckId}
      layout={layoutFor(cards, seed, round)}
      onAgain={() => setRound((r) => r + 1)}
    />
  );
}

// Tap a term, then its definition. A pair matches when the definition text equals the term's definition,
// so duplicate definitions never reject a right answer. A wrong one flashes and clears.
function MatchRound({
  deckId,
  layout,
  onAgain,
}: {
  deckId: string;
  layout: { total: number; terms: StudyCard[]; defs: StudyCard[] };
  onAgain: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [matchedTerms, setMatchedTerms] = useState<Set<string>>(new Set());
  const [matchedDefs, setMatchedDefs] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<{ term: string; def: string } | null>(null);
  // The clock starts on the first term tap. Finish time is taken from the same start, at the moment of the last match.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finishedMs, setFinishedMs] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const { total } = layout;
  const finished = finishedMs !== null;

  // Times come from the tap events (same clock as performance.now), so start and finish are read at the tap itself.
  useEffect(() => {
    if (startedAt === null || finished) return;
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, [startedAt, finished]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  const termById = (id: string) => layout.terms.find((c) => c.id === id);
  const defById = (id: string) => layout.defs.find((c) => c.id === id);

  const tapTerm = (id: string, at: number) => {
    if (matchedTerms.has(id) || finished) return;
    if (startedAt === null) {
      setStartedAt(at);
      setNow(at);
    }
    setPicked(id);
    setMessage("");
  };

  const tapDef = (id: string, at: number) => {
    if (matchedDefs.has(id) || finished) return;
    if (picked === null) {
      setMessage("Pick a term first.");
      return;
    }
    const def = defById(id);
    const term = termById(picked);
    if (def && term && pairsWith(term, def)) {
      const nextTerms = new Set(matchedTerms).add(picked);
      setMatchedTerms(nextTerms);
      setMatchedDefs((m) => new Set(m).add(id));
      setPicked(null);
      setMessage("");
      if (nextTerms.size === total && startedAt !== null) setFinishedMs(at - startedAt);
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
        <p className="num font-display text-[clamp(2.5rem,10vw,4rem)] leading-none font-bold">{seconds(finishedMs)} s</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onAgain}>Play again</Button>
          <Link href={`/flashcards/${deckId}`} className="caps step inline-flex h-12 items-center border border-ink px-6 text-[17px] hover:bg-band">
            Back to deck
          </Link>
        </div>
      </div>
    );
  }

  const elapsed = startedAt === null ? 0 : now - startedAt;

  const cell = (c: StudyCard, side: "term" | "def") => {
    const isMatched = side === "term" ? matchedTerms.has(c.id) : matchedDefs.has(c.id);
    const isPicked = side === "term" && picked === c.id;
    const isFlash = flash !== null && (side === "term" ? flash.term === c.id : flash.def === c.id);
    return (
      <button
        key={`${side}-${c.id}`}
        type="button"
        onClick={(e) => (side === "term" ? tapTerm(c.id, e.timeStamp) : tapDef(c.id, e.timeStamp))}
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
          {matchedTerms.size} of {total} matched · {seconds(elapsed)} s
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
      <div className="grid grid-cols-1 gap-6 min-[400px]:grid-cols-2 min-[400px]:gap-3">
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
