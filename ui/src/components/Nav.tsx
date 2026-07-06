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
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Repositories
          </Link>
          <Link
            href="/tools"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Tools
          </Link>
        </nav>
      </div>
    </header>
  );
}
