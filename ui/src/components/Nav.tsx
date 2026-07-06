import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span
            className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
            aria-hidden
          >
            H
          </span>
          <span className="text-lg font-semibold tracking-tight">Hobits</span>
        </Link>
        <span className="ml-1 hidden text-sm text-muted-foreground sm:inline">
          repository insights
        </span>
      </div>
    </header>
  );
}
