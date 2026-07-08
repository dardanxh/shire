# CLAUDE.md (UI)

Conventions for the `ui/` SPA. Builds on the stack summary in root `CLAUDE.md` and the rationale in `ui/PLAN.html`. Read `PLAN.html` when you need to know *why* a choice was made or what's parked.

## Working in ui/

- **Build cadence is step-by-step.** Small, focused prompts — one layer at a time. Do not scaffold whole features in one go.
- **Don't propose tools, structure, or patterns that contradict locked decisions.** If a request seems to, surface the conflict before changing direction.
- **Parked items** (auth flow, hosting specifics, charts, dark-mode values, real-time, scaffolding CLI) — flag rather than improvise.

## Folder structure

```
src/
├── features/
│   ├── projects/
│   │   ├── api.ts              # query hooks, mutations
│   │   ├── keys.ts             # query-key factory
│   │   ├── schemas.ts          # Zod schemas (forms)
│   │   ├── components/
│   │   ├── locales/            # en.json, etc.
│   │   └── index.ts            # public exports
│   ├── customers/
│   └── ...
├── components/
│   ├── ui/                     # shadcn primitives (owned code)
│   └── shared/                 # AppShell, DataTable wrapper, KanbanBoard, etc.
├── lib/
│   ├── api.ts                  # openapi-fetch client + extractErrorMessage
│   ├── query-client.ts         # QueryClient with global MutationCache.onError
│   ├── env.ts                  # Zod-validated import.meta.env
│   └── i18n.ts
├── locales/
│   └── common/                 # cross-feature dictionaries (incl. kanban.*)
├── routes/                     # TanStack Router file-based tree (thin)
└── index.css                   # Tailwind directives + theme vars
```

One folder per feature; new CRUD page = copy a feature folder, rename. Routes are thin imports from `features/*`. Generated route tree is an artifact — never hand-edit.

## API layer

- Client in `lib/api.ts`, built on `openapi-fetch` with types from `openapi-typescript` (regenerated from FastAPI's `/openapi.json`).
- No `baseUrl` on the client. FastAPI's openapi.json paths already include the `/api/v1` prefix; the dev Vite proxy (`/api → :8000`) handles dev routing. Call paths verbatim: `api.GET("/api/v1/customers/", ...)`.
- **Dev auth shim** (`DEV_USER_ID` / `DEV_ORGANIZATION_ID` / `DEV_USER_ROLE` constants + middleware) lives in `lib/api.ts`. Update IDs to match seeded rows in your local DB. Remove the shim when Cognito lands.
- Per-feature hooks live in `features/{feature}/api.ts`. Naming:
  - List: `use{Entities}Query(params)` — bulk-named like the backend (`useCustomersQuery`).
  - Detail: `use{Entity}Query(id)` (`useCustomerQuery`).
  - Mutations: `useCreate{Entity}Mutation`, `useUpdate{Entity}Mutation(id)`, `useDelete{Entity}Mutation`.
- **Hooks throw the raw error body** (`if (error) throw error;`). The body is `{ detail, code }` from FastAPI's exception handlers (see `be/main.py`). React Query routes the throw into `onError`.

### Query keys: per-feature factory

Each feature owns a `keys.ts` exporting a hierarchical factory. Inline string keys are not allowed.

```ts
// features/customers/keys.ts
export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (params: ListParams) => [...customerKeys.lists(), params] as const,
  details: () => [...customerKeys.all, "detail"] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
};
```

Mutations invalidate the broadest key that's still correct — typically `customerKeys.all`, which cascades through TanStack's prefix matching. Sub-resources (e.g. `projectKeys.tasks(projectId)`) are nested under the same root so root invalidation refreshes them too.

### Mutations: prefer `mutate` + `onSuccess`/`onError`

Default pattern. The handler is **not** `async`, no `try/catch`:

```ts
const { mutate: createCustomer, isPending } = useCreateCustomerMutation();

const handleSubmit = (values: CustomerFormValues) => {
  createCustomer(values, {
    onSuccess: () => {
      toast.success(t("new.toast_success"));
      navigate({ to: "/customers", search: LIST_SEARCH });
    },
  });
};
```

- **Don't pass `onError: () => toast.error(...)`** — the global `MutationCache.onError` (in `lib/query-client.ts`) already toasts the BE message. Adding a consumer onError just for toasting double-fires. **The same applies to a `try/catch` around `mutateAsync` whose `catch` calls `toast.error`** — same double-fire, harder to spot. If you don't need the surrounding `await` chain, use `mutate` + `onSuccess` and let errors flow to the global handler.
- **Use `mutateAsync` only for genuine sequential chains** where the second call needs the first's response (e.g. `createProject` then `initTasks(project.id)` in `NewProjectPage`, or task update + attachment upload in `TaskDetailDialog.handleSave`). Keep the surrounding `try { ... } catch {}` — empty catch is intentional, the global handler covers the toast. *Not* a chain: a single upload that just closes a dialog on success — use `mutate` + `onSuccess: () => closeDialog()`.

### Destructure at the call site

Always destructure `useQuery`/`useMutation` results — don't bind the whole object:

```ts
// Yes
const { data: customer, isPending, isError, refetch } = useCustomerQuery(id);
const { mutate: deleteCustomer, isPending: isDeleting } = useDeleteCustomerMutation();

// No
const customerQuery = useCustomerQuery(id);
const deleteCustomer = useDeleteCustomerMutation();
```

Alias to entity names when multiple queries collide on `data` / `isPending`. Mutations destructure `mutate` (or `mutateAsync` in the chained case) renamed to a verb (`createCustomer`, not `mutate`).

### Errors: centralized toast via MutationCache

`lib/query-client.ts` configures a `MutationCache.onError` that pulls the BE detail through `extractErrorMessage(err)` (in `lib/api.ts`) and toasts it. The extractor handles:

- `{ detail: string, code: string }` — AppError handlers (404/400/403), IntegrityError → 409, generic 500.
- `{ detail: Array<{ msg }> }` — FastAPI 422 validation errors (joined).
- Native `Error` — falls through to `err.message`.
- Unknown — `"Something went wrong. Please try again."`

Don't add per-consumer error toasts. If you need to suppress the global toast for a specific mutation (e.g. a tolerable 404 you'd rather handle silently), the pattern would be a `meta` flag on the mutation that the global `onError` checks — not yet wired up; revisit when a real case appears.

Recoverable failures → already toasted. Unrecoverable → bubble to `react-error-boundary`.

## Routes (TanStack Router)

- File-based in `src/routes/`. Route files are thin — validate search params, call loaders that warm the Query cache, render a feature component.
- Search params validated with Zod. Filters / sort / pagination / open-panel id belong in the URL, not in component state. Use `.catch(default)` per field so bad URLs degrade gracefully instead of throwing.
- **Parent layout route for breadcrumbs.** When a feature has sub-routes (`/customers/new`, `/customers/$id`), put a layout file at `_authed/{feature}.tsx` next to the `_authed/{feature}/` directory. The layout file owns `staticData: { crumbKey }` and renders `<Outlet />`. Children then drop their own `staticData.crumbKey` for the index route, but keep their own leaf crumbKey for new/detail routes. `useMatches()` returns parent + leaf, so Breadcrumbs naturally renders "Customers → New customer".
- **Navigating to a route with `validateSearch`** requires an explicit `search` param: `navigate({ to: "/customers", search: { page: 1, size: 20 } })`. TS will refuse `{ to: "/customers" }` without it. Hoist a `LIST_SEARCH` const if you reuse the defaults.
- **`useNavigate({ from })` and `useSearch({ from })`** take the route id with trailing slash for index routes (`from: "/_authed/customers/"` for `useSearch`, `from: "/customers/"` for `useNavigate`). Match what the route tree generates.
- Authenticated route pattern: **TBD** (waiting on auth flow decision — see PLAN.html parking lot).

## Sidebar nav active state

For nav items with sub-routes (any feature with `/new`, `/$id`, etc.), use prefix match so the parent stays highlighted on child pages:

```ts
const isActive =
  item.to === "/"
    ? location.pathname === "/"
    : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
```

Root `/` must use exact match — `startsWith("/")` is true for everything.

## Schemas (Zod)

- `features/{feature}/schemas.ts` holds form schemas. RHF resolves from these.
- Form schemas are the source of truth for *form validation*. Generated `openapi-typescript` types are the source of truth for *API request/response shape*. Don't conflate.
- When form schema diverges from backend shape, comment the divergence.

## Components

- **shadcn primitives** live in `components/ui/`. Treat them as owned code — edit them directly when you need new behavior. Don't try to upgrade them transparently.
- **Use shadcn primitives directly from features** — `import { Button } from "@/components/ui/button"`. No pass-through wrapper layer.
- **App-wide behavior on a primitive** (loading state, analytics on click, default size, etc.) goes *inside* `components/ui/{primitive}.tsx`. Don't wrap it elsewhere.
- **Cross-feature shared components** live in `components/shared/`. Currently shipped: `DataTable`, `DataTablePagination`, `DatePicker`, the field family in `form-fields.tsx`, and the project-tasks kanban (`KanbanBoard`, `KanbanColumn`, `TaskCard`). Composed components only — never one-to-one primitive pass-throughs. Don't pre-extract abstractions ("`<PageHeader>`", "`<EmptyState>`") until two real consumers force them.
- **Feature-local components**: `features/{feature}/components/`.
- Naming: PascalCase. No feature prefix on filenames inside the feature folder.
- Compose primitives, don't fork them. Variants go through `cva` (already shadcn-standard), not new files.

### Common shadcn missteps to push back on

The user is new to shadcn — flag these proactively:

- **Forking a primitive into a new file** when editing `components/ui/{primitive}.tsx` would do.
- **Creating a wrapper component** that just forwards props (`<AppButton>` returning `<Button {...props} />`).
- **Adding a new component** when a `cva` variant on the existing one would suffice.
- **Hand-concatenating class strings** (`` className={`base ${cond ? 'x' : 'y'}`} ``) instead of using `cn()` from `lib/utils.ts` — `cn()` runs `tailwind-merge` so conflicting utilities resolve correctly.
- **Importing Radix directly** when shadcn already wraps that primitive in `components/ui/`.
- **Putting business logic in `components/ui/`** — primitives stay generic; feature logic stays in the feature.
- **Trying to "update shadcn"** as a dep — there is no dep. The CLI installs files; you own them. Re-running `npx shadcn@latest add <component>` overwrites; only do that intentionally.
- **Using shadcn form primitives without RHF** — `<Form>`, `<FormField>`, `<FormControl>`, `<FormMessage>` are designed to plug into RHF context. Use them as a unit.
- **Nova preset gotcha**: some registry items (`form` is the known one) are empty stubs in the `radix-nova` style — `npx shadcn add form` exits silently with no file written. Workaround: fetch from the `default` style (`https://ui.shadcn.com/r/styles/default/{component}.json`), then adapt to project style (function components, no forwardRef, `radix-ui` umbrella imports — match `breadcrumb.tsx` / `separator.tsx`).
- **Biome a11y on shadcn-generated files**: when a shadcn install brings in helper primitives (e.g. `command` pulls in `input-group.tsx`), Biome may flag accessibility rules that don't apply to those components. Add the rule to the `**/components/ui/**` override in `biome.json` rather than editing the generated file. Already off there: `useFocusableInteractive`, `useSemanticElements`, `useKeyWithClickEvents`.

## Styling

- **Tailwind v4** (CSS-first config via `@theme` in `src/index.css`). No `tailwind.config.js`.
- Tailwind utility classes inline. No `.module.css`, no CSS-in-JS.
- Use semantic theme tokens (`bg-background`, `text-foreground`, `border-border`, `text-primary`) — never hardcode hex/oklch values in components.
- shadcn defaults for radius / font / spacing. Customize only with a brand reason.
- Custom semantic tokens (`--success`, `--warning`, etc.) added on first use, not pre-defined.
- **Mobile-first.** Write base styles for mobile, layer up with `sm:` / `md:` / `lg:`.

## Layout: flex children and horizontal overflow

Default flex item `min-width` is `auto`, which lets a child grow to fit its intrinsic content size and silently push the parent wider than the viewport. Two load-bearing rules:

- **Flex children that may contain wide content need `min-w-0`.** This is set on `SidebarInset` (in `components/ui/sidebar.tsx`) and the `<main>` inside `AppShell.tsx`. Without it, a kanban column row, a wide table, etc. will push the page wider than the viewport instead of allowing the inner `overflow-x-auto` to scroll.
- **Wrap horizontal-scroll content in an `overflow-hidden` boundary.** Pattern used by the kanban: outer `<div className="overflow-hidden">` (caps width to parent) → inner `<div className="flex ... overflow-x-auto">` (scrolls within). The outer is a defensive boundary so the inner can never push wider than its slot.

Symptom of a missed `min-w-0`: page expands beyond viewport on small screens, the right side is clipped, sticky header buttons disappear off-screen.

## Kanban (project tasks)

`components/shared/KanbanBoard.tsx` is the **single, purpose-built** kanban for project tasks. It is intentionally not generic — it knows tasks have a `project_id`, types (`basic`/`payment`/`offer`), and uses the `common.kanban.*` translation namespace for column labels, type/priority chips, and move toasts. Two consumers:

- `features/board/components/BoardKanban.tsx` — global view across projects; passes `getTaskCardProps` for project name/color/customer chip decoration.
- `features/projects/components/ProjectKanbanBoard.tsx` — project-scoped view with its own header (title + Create Task button) and `CreateTaskDialog`.

The shared component owns the type-aware move dispatch (basic/payment/offer → matching `/api/v1/task-*` endpoint) inside its `useMutation`, plus invalidation of `boardKeys.all` and `projectKeys.tasks(task.project_id)`. Don't add an `onMoveTask` override prop or extract a "generic kanban" — there's only one kanban in this app.

`KanbanColumn` is the four-column shape; private to the shared kanban (still file-level export for dnd-kit's droppable, but no other consumer should import it).

## Theme

- `next-themes` wraps the app at root (`<ThemeProvider>`). Wired up from day one for state + localStorage + no-flash-on-load, even though only `light` is shipped initially.
- `.dark { }` block exists in `src/index.css` but is empty until dark mode lands.
- No toggle UI yet. `useTheme()` available when we want to add one.

## State

Hierarchy — use the leftmost that fits:

> URL search params → TanStack Query cache → Zustand store → component `useState`.

- Filters, sort, pagination, open-detail-panel id → URL.
- Server data → Query.
- Cross-tree UI state (theme, command palette open) → Zustand. Add stores only when needed.
- Local UI (input value, hover) → `useState`.

## useEffect: avoid by default

`useEffect` is for genuine *side effects* (DOM subscriptions, observers, timers, integrations with non-React libs). It is **not** the right place for state synchronization. Before reaching for one, check the alternatives:

- **Derived from props/state during render** → just compute it. No effect, no `useMemo` unless the value is expensive.
- **Form mirrors server data** → RHF's `values` prop (see Forms section). Not `useState` + `useEffect(() => form.reset(...), [data])`.
- **Cleanup of a resource tied to a piece of state** (e.g. `URL.revokeObjectURL` for a Blob URL, an open WebSocket, a subscription) → wrap the setter so cleanup happens at mutation time: `setX((prev) => { cleanup(prev); return next; })`. Trade-off: a leak on unmount in the rare case the resource is still active. Accept it unless the leak is meaningful. See `ProfileSection.replacePicked`.
- **Mirroring one piece of state into another** → that state shouldn't exist; lift or remove it.
- **Reacting to a user event** → put the logic in the event handler, not in an effect watching the state it sets.

Effects that *are* legitimate: focusing an input on mount, subscribing to a window event, integrating with `react-leaflet` / dnd-kit imperative APIs, registering a hotkey, syncing with `localStorage` for non-react state. When you write one, leave a one-line comment explaining what side effect it owns — if the comment is "syncs X into Y," there's probably a non-effect alternative.

## Forms (RHF + Zod)

- Schema in `features/{feature}/schemas.ts`. Form component in `features/{feature}/components/`.
- Use shadcn's `<Form>` (FormProvider) wrapper at the top.
- **Use the shared field components** from `components/shared/form-fields.tsx`:
  - `<TextField>` — text/email/tel/etc. inputs (passes `type`, `autoComplete`, etc. through to `<Input>`)
  - `<TextareaField>` — multiline (passes `rows`, etc. through to `<Textarea>`)
  - `<SelectField>` — small fixed enums via shadcn `<Select>`. Caller renders `<SelectItem>` children.
  - `<ComboboxField>` — searchable single-select (Popover + cmdk). Pass `multiple` to switch to multi-select with chip rendering below the trigger.
  - `<DateField>` — wraps `<DatePicker>` (Popover + Calendar)
  - `<FormFooter>` — submit + cancel button row
  They read RHF context internally; no need to thread `control`. Pass an explicit generic (`<TextField<MyFormValues> ...>`) so `name` is type-checked.
- **Picker decision tree**: small fixed enum (≤6 options, no search needed) → `<SelectField>`. Larger or growing list, single value → `<ComboboxField>`. Larger list, multi-value → `<ComboboxField multiple>`.
- **New input type? Extend `form-fields.tsx` first.** When a feature needs a checkbox, radio group, switch, multi-select, file input, etc., add a `<CheckboxField>` / `<RadioField>` / etc. to `components/shared/form-fields.tsx` (same shape as the existing fields: read `control` from `useFormContext<T>()`, render the FormItem/FormLabel/FormControl/FormMessage shell). Don't inline a one-off `<FormField>` block in the feature form — even if it's the only consumer right now, it'll be duplicated by the next feature.
- Drop down to `<FormField>` directly only for genuinely one-of-a-kind fields (e.g., an inline editable address picker that wires to a map). When you do, follow the existing shell: `<FormItem><FormLabel/><FormControl/><FormMessage/></FormItem>`.
- **Resolver**: `import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"` — Zod 4 implements Standard Schema natively, and `@hookform/resolvers` v5 dropped its dedicated `zod` adapter. Don't import `zodResolver`.
- **Don't use `.default()` in form schemas.** It creates an input/output type mismatch that breaks `standardSchemaResolver` typing. Set defaults via RHF's `defaultValues` instead.
- **Mirroring server data into a form? Use RHF's `values` prop, not `useState` + `useEffect`.** When the form is seeded from a query (`useUserQuery`, `useProjectQuery`, etc.), pass `values: data ? { … } : undefined` alongside `defaultValues`. RHF resets the form whenever the `values` reference changes — covers both "query just resolved" and "selection changed" without an effect. Don't introduce a `useState` per field plus a `useEffect` that calls `form.reset(...)` — it duplicates RHF's internal state and is a common anti-pattern when porting a non-RHF form. See `ProfileSection.tsx` for the right shape.
- **Don't inline `<Label> + <Input>` blocks for one-off forms.** Even a 1-3 field form goes through `<Form>` + `<TextField>` / `<TextareaField>` / etc. The shared shell handles RHF wiring, labels, error messages, and aria — re-inventing it inline drops validation and accessibility.
- **Forms are pages, not dialogs.** New/edit live at `/{feature}/new` and `/{feature}/$id/edit` for shareability and mobile fit. Delete uses a confirm dialog (`AlertDialog`).
- A single `{Entity}Form` component is shared between New and Edit pages — only `defaultValues`, `submitLabel`, and the mutation handler differ. **Exception**: when New and Edit use meaningfully different schemas (e.g. an immutable field that exists only on create — see `Users` with `cognito_sub`), inline the form JSX in each page instead of forcing a shared component with conditional rendering. The schemas can still share base fields via Zod object spread.
- Submit calls a mutation hook from `api.ts`. Pending state from the destructured `isPending`. Errors are toasted globally — don't add a per-consumer `onError` toast (see API layer).

## Tables (TanStack Table + shadcn)

- Use `<DataTable>` and `<DataTablePagination>` from `components/shared/`. They wrap shadcn `<Table>` + TanStack Table and own skeleton / empty / error states, row click + actions-cell stop-propagation, and the paginated footer (size selector + prev/next).
- Per-feature concerns the consumer supplies: `columns`, `data`, query state flags, `emptyState` (render prop with copy + CTA), `onRowClick`, and translated `labels` for the pagination component. The shared components don't import i18next.
- Filter / sort / pagination state lives in URL search params (typed via TanStack Router validators).
- Tables stay as tables on small screens for now (responsive strategy unresolved — revisit once we have real screens to test).

## i18n

- `i18next + react-i18next`. Dictionaries in `features/{feature}/locales/{lang}.json` per feature, plus `src/locales/common/{lang}.json` for shared keys (buttons, common errors, date formats).
- Key style: dot-namespaced, lowercase, descriptive — `projects.list.empty`, `customers.form.email.invalid`.
- **No untranslated literals in JSX.** All user-facing text goes through `t()`.
- **Same rule for user-facing strings in JS constants.** A `Record<Status, string>` of labels, a `["New", "In Progress", "Done"]` array used to render buttons — these are still strings rendered to the user. Key them by enum/id and resolve via `t(`section.${key}`)` at render time, not via a hardcoded English map at the top of the file.
- Default language: English. Second language deferred.

## File uploads (S3 presigned)

1. UI requests a presigned URL from the API for the target file.
2. UI uploads the file *directly to S3* via that presigned URL (no proxy through the API).
3. After upload succeeds, UI POSTs attachment metadata to the API.

Helper for steps 1 and 3 lives in `features/attachments/api.ts`.

## Errors, loading, empty states

- Root `<ErrorBoundary>` from `react-error-boundary`. One per route layout too. Fallback: friendly "something went wrong" panel with a retry button. No Sentry yet.
- Loading: prefer TanStack Query's `isPending` + skeleton placeholders. Avoid global spinners.
- Empty: show an inviting empty state ("No projects yet — create one") with a primary action, not a blank panel.

## Env config

- All env vars use `VITE_` prefix.
- Access *only* through `lib/env.ts`, which Zod-validates `import.meta.env` at module load.
- Missing/invalid env throws at app boot, not silently at runtime.

## Common commands

```bash
pnpm dev               # vite dev server (port 5173, /api proxies to :8000)
pnpm build             # tsc -b && vite build (also regenerates routeTree.gen.ts)
pnpm typecheck         # tsc -b
pnpm lint              # biome check
pnpm fix               # biome check --write
pnpm openapi:gen       # regenerate src/lib/api-types.gen.ts from http://localhost:8000/openapi.json
```

After every non-trivial UI change, run `pnpm typecheck` and `pnpm lint` (or `pnpm build` for both + bundle output) before reporting work complete.

## CRUD feature pattern

Three CRUD features ship today: **customers**, **projects** (with view + tag picker + tasks board), **users** (no view; diverging new/edit forms). Mirror them when adding a new entity. **Tags** are managed inside `settings/` — they're a small list with no standalone routes.

**Files to create / change** (full version with view page):

```
src/features/{feature}/
  api.ts             # use{Entities}Query, use{Entity}Query (with `enabled: id !== ""`),
                     # useCreate/Update/Delete{Entity}Mutation
  keys.ts            # query-key factory (see "Query keys" in API layer)
  schemas.ts         # Zod form schema (no .default(); RHF holds defaults)
  components/
    {Entity}Form.tsx           # shared form, used by New + Edit
    {Entities}ListPage.tsx     # uses shared DataTable + DataTablePagination, row actions inline
    {Entity}ViewPage.tsx       # read-only details + Edit/Delete header buttons
    NewEntityPage.tsx          # mounts {Entity}Form with empty defaults
    EditEntityPage.tsx         # fetches by id, mounts {Entity}Form with hydrated defaults,
                               # navigates to view on success
    Delete{Entity}Dialog.tsx   # AlertDialog wrapping the delete mutation; optional `onDeleted` callback
  locales/en.json
  index.ts           # public exports

src/routes/_authed/
  {feature}.tsx                   # parent layout: staticData crumbKey + <Outlet />
  {feature}/index.tsx             # list route, validateSearch (page, size)
  {feature}/new.tsx               # leaf, staticData crumbKey for "New X"
  {feature}/$id/index.tsx         # view route
  {feature}/$id/edit.tsx          # edit route
```

**Skip the view page for tiny entities** (one or two visible fields, no audit data worth showing — see `tags`, `users`). Then collapse the routes:

```
{feature}/$id/edit.tsx            # edit route only; row click goes here directly
```

…and omit `{Entity}ViewPage.tsx`.

**REST-style URL convention**: `/$id` is the view (read-only), `/$id/edit` is the form. Row click navigates to view (or edit when no view exists). Action menu's "Edit" goes to `/$id/edit`. After a successful edit, navigate to view (not back to list) so the user sees their change.

**Build order** (one prompt per phase):

1. Regenerate types from backend openapi (backend must be running).
2. Scaffold `features/{feature}/` skeleton + nested routes + parent layout + sidebar nav item.
3. List page: query hook, `<DataTable>` + `<DataTablePagination>`, row click navigation.
4. New page: form schema, create mutation, toast, navigate back.
5. View page (skip for tiny entities): detail query, read-only `<dl>`, Edit/Delete header buttons.
6. Edit + delete: update mutation, `Delete{Entity}Dialog` with `onDeleted` for view→list redirect.
7. Polish: empty-state CTA, mobile pagination layout, badge colors for enums. Skip search/sort unless backend exposes those query params.

**Non-obvious gotchas** (avoid re-discovering):

- Backend write endpoints need `X-User-Id` / `X-Organization-Id` / `X-User-Role`. The dev shim in `lib/api.ts` handles this — keep IDs in sync with seeded DB rows.
- **Bootstrapping a fresh local DB**: the first `organization` and `user` rows must be inserted via SQL. You can't create them through the UI because every write needs a valid `X-User-Id` for the audit `created_by` foreign key — chicken-and-egg. Insert one org + one admin user via psql, then put their IDs into `DEV_USER_ID` / `DEV_ORGANIZATION_ID`. Symptom of skipping this: writes return `409 Conflict` (FK violation on `organizations` or `users`).
- When form input shape diverges from API request shape (e.g. empty-string email → `null` for the API; `Date` → `YYYY-MM-DD` string), normalize in the page component's submit handler, not in the schema.
- Detail queries chained off a parent query (e.g. project view fetching its customer) need `enabled: id !== ""` inside the hook so they don't fire with an empty id while the parent loads.
- For routes with `validateSearch`, navigating with `<Link>` or `navigate({ to })` requires an explicit `search` object — even on the index. Hoist a `LIST_SEARCH = { page: 1, size: 20 } as const` and reuse.
- Bundle warning at ~520KB raw is expected (React + Router + Query + radix shared chunk; ~160KB gzipped). `chunkSizeWarningLimit` is bumped to 600 in `vite.config.ts`. Don't try to "fix" it.

## What's intentionally not in this file

- Stack rationale — see `ui/PLAN.html`.
- Stack summary — see root `CLAUDE.md`.
- Backend conventions — see `be/CLAUDE.md`.

## Project reality (how this repo differs from the blueprint above)

The conventions above are the source of truth for *how we build*. A few concrete
facts about *this* codebase differ from the generic blueprint's examples — follow
these when they conflict:

- **Domain is `repositories`, not CRM.** The backend (`be/`, FastAPI "hobits") is
  a repository-scorecard API. The shipped features are `repositories`
  (list · view/scorecard · ingest · refresh · per-tool run) and `tools` (tool
  availability). There are no `customers`/`projects`/`users`/`tasks`/kanban —
  treat those blueprint examples as pattern illustrations, mapping them onto
  `repositories` when adding features.
- **No `/api/v1` prefix, no auth shim.** The backend exposes bare paths
  (`/repositories`, `/tools`). The client sets `baseUrl: "/api"` and the Vite
  proxy strips `/api` → `:8000` (`vite.config.ts`). Call paths verbatim:
  `api.GET("/repositories")`. The backend has no per-request auth headers, so
  there is no `DEV_USER_ID`/`X-User-Id` shim and no bootstrap-SQL step.
- **Primitives are shadcn on `@base-ui/react`** (the `base-nova` style), not
  Radix. Still owned code in `components/ui/` — the "edit the file, don't wrap or
  fork" rules all apply; just import from `@base-ui/react/*`, not `radix-ui`.
  `form.tsx` wires RHF without Radix `Slot` (uses `cloneElement`).
- **Routes are flat, no `_authed`.** Auth is parked, so routes live directly
  under `src/routes/` (`index.tsx` = list, `repositories.$id.tsx` = view,
  `tools.tsx`). Breadcrumbs come from route `staticData.crumb` (an i18n key).
- **List pagination is client-side.** The backend returns full lists, so
  `<DataTablePagination>` slices in-memory off URL `page`/`size` search params.
- Everything else — feature folders, query-key factories, `mutate` + `onSuccess`
  with the global `MutationCache.onError` toast, RHF + Zod via
  `standardSchemaResolver`, i18next for all copy, `min-w-0` layout rules — is
  followed as written above.
