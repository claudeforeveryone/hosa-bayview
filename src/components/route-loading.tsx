// Shown the moment a link is clicked, while the server builds the next page. Hidden for the first 150 ms so
// quick pages swap straight in without a flash. `inner` drops the title block for pages inside a classroom,
// whose header stays put.
export function RouteLoading({ inner = false }: { inner?: boolean }) {
  return (
    <div className="route-loading grid grid-cols-1 gap-8">
      <p className="sr-only" role="status">
        Loading
      </p>
      <div
        className="route-loading-rail h-[3px] overflow-hidden bg-rule"
        aria-hidden
      >
        <span className="block h-full w-1/4 bg-ink" />
      </div>
      {inner ? null : (
        <div className="grid gap-3" aria-hidden>
          <span className="block h-[clamp(2.5rem,9vw,4.5rem)] w-[min(28rem,70%)] bg-band" />
          <span className="block h-4 w-40 bg-band" />
        </div>
      )}
      <div className="grid border-t border-rule" aria-hidden>
        {[72, 56, 64, 48].map((w) => (
          <div key={w} className="flex h-14 items-center border-b border-rule">
            <span className="block h-4 bg-band" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
