"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// Text field with a filtered suggestion list. Free text is allowed; the input itself is what submits.
export function Combobox({
  label,
  name,
  options,
  defaultValue = "",
  error,
  maxLength,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  error?: string;
  maxLength?: number;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // Opening shows everything; typing filters.
  const shown = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!typed || !q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, value, typed]);

  function choose(option: string) {
    setValue(option);
    setOpen(false);
    setActive(-1);
    setTyped(false);
    input.current?.focus();
  }

  function move(delta: number) {
    if (!open) setOpen(true);
    const next = shown.length ? (active + delta + shown.length) % shown.length : -1;
    setActive(next);
    list.current?.children[next]?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && open && active >= 0 && shown[active]) {
      e.preventDefault();
      choose(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          ref={input}
          id={id}
          name={name}
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${id}-o${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setTyped(true);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="step h-12 w-full border border-rule-strong bg-transparent pr-12 pl-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-danger"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? `Close ${label} list` : `Open ${label} list`}
          onMouseDown={(e) => {
            e.preventDefault();
            setTyped(false);
            setOpen((o) => !o);
            input.current?.focus();
          }}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-2 hover:text-ink"
        >
          <ChevronDown size={20} strokeWidth={1.75} className={open ? "rotate-180" : ""} aria-hidden />
        </button>
        {open && shown.length ? (
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute inset-x-0 top-full z-30 -mt-px max-h-72 overflow-y-auto border border-ink bg-ground"
          >
            {shown.map((option, i) => {
              const selected = option === value;
              return (
                <li
                  key={option}
                  id={`${id}-o${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseMove={() => setActive(i)}
                  className={`flex h-11 cursor-pointer items-center justify-between gap-3 border-b border-rule px-3 text-[16px] last:border-b-0 ${
                    i === active ? "bg-ink text-ground" : ""
                  }`}
                >
                  <span className="truncate">{option}</span>
                  {selected ? <Check size={18} strokeWidth={2} aria-hidden /> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-err`} className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
