# Initial architecture: RPG Card Designer

> Status: technical skeleton implemented and verified on 2026-09-14. The card designer is intentionally **not** implemented yet.

## 1. Scope and goals

The first product increment should be a small, client-side React application that edits semantic card content, previews it through one visual template, and prints it. It should remain system-neutral: a spell, item, monster, or custom concept is content, not a separate hard-coded application mode.

The current commit is an even smaller foundation/smoke test. It proves this path:

```text
repository -> npm -> TypeScript -> React/Vite -> dist/ -> GitHub Pages
```

There is no backend, authentication, database, editor, persistence, routing, or runtime API in this skeleton. Those omissions are deliberate.

## 2. Proposed architecture

Use a small feature-oriented frontend with three boundaries:

```text
React editor UI ── emits actions ──> application state
       │                                  │
       │ props                            │ owns CardDocument values
       v                                  v
template renderer <── CardContent + TemplateSettings
                                          │
                                          v
                              DocumentRepository interface
                                          │
                           localStorage / JSON adapters later
```

1. **Domain/data** contains plain TypeScript types and pure validation/defaulting functions. It imports neither React nor browser APIs.
2. **Presentation/design** contains template definitions and React renderers. A renderer receives semantic content and template settings; the content never refers to a component, CSS class, or HTML element.
3. **Application/UI** coordinates editing and state. Infrastructure adapters for browser persistence or file import/export stay at the edge.

This is separation by dependency direction rather than a large clean-architecture framework. The domain is reusable and serializable, while this small browser app avoids service containers, class hierarchies, and excessive indirection.

## 3. Proposed folder structure for the MVP

Only `src/App.tsx`, `src/main.tsx`, and `src/styles.css` exist today. Add the remaining folders when their first real code is introduced; empty architecture folders provide no value.

```text
src/
├── main.tsx                    # browser composition root
├── App.tsx                     # application shell
├── styles.css                  # global/reset and print styles
├── domain/
│   ├── card.ts                 # semantic CardContent/CardDocument types
│   └── cardDefaults.ts         # pure default factory
├── templates/
│   ├── template.ts             # template metadata/settings contract
│   └── classic/
│       ├── ClassicCard.tsx     # initial renderer
│       └── classicCard.css     # screen and printed card design
├── features/
│   └── editor/
│       ├── CardEditor.tsx      # controlled form
│       └── editorState.ts      # reducer and actions
├── components/
│   └── CardPreview.tsx         # selected-template boundary
└── infrastructure/
    └── documentRepository.ts   # persistence port; adapter added later
```

Tests should sit next to the code they test (for example, `editorState.test.ts`) rather than mirror the entire tree in a second hierarchy.

## 4. Initial TypeScript data model

The following is the recommended starting point, not code included in the smoke test:

```ts
export type CardId = string

export interface CardContent {
  id: CardId
  title: string
  subtitle?: string
  body: string
  footer?: string
  image?: {
    source: string
    altText: string
  }
}

export interface CardAppearance {
  templateId: string
  settings: Record<string, unknown>
}

export interface CardDocument {
  schemaVersion: 1
  content: CardContent
  appearance: CardAppearance
}
```

`CardContent` expresses meaning. It does not contain JSX, CSS, pixel coordinates, font sizes, or renderer names. `CardAppearance` selects a design and carries design-specific values. `CardDocument` is the serialization boundary and includes a schema version so future JSON/local-storage migrations are possible.

For the first template, replace the unconstrained `Record<string, unknown>` at the renderer boundary with validated settings:

```ts
export interface ClassicTemplateSettings {
  accentColor: string
  backgroundColor: string
  textColor: string
}

export interface CardTemplate<TSettings> {
  id: string
  name: string
  defaultSettings: TSettings
  validateSettings(value: unknown): TSettings
}
```

The flexible serialized shape prevents the domain model from importing every template's type. Runtime validation at import/load time converts unknown JSON into safe typed values. Do not pretend parsed JSON is trusted merely by casting it with `as CardDocument`.

### Data versus presentation

| Concern | Card data | Template/design |
|---|---|---|
| Examples | title, body, semantic image, footer | size, regions, colors, typography, border, spacing |
| Ownership | `domain/` | `templates/` |
| React dependency | none | renderer may use React |
| Serialization | stable and versioned | settings stored by template ID |
| Change impact | a new template reuses it | a new design does not migrate semantic fields |

An image's source and alternative text belong to content because they carry meaning. Its crop, position, mask, and opacity belong to presentation. Some future requirements will blur this line; prefer explicit small appearance settings rather than leaking generic CSS properties into `CardContent`.

## 5. React component structure

The proposed MVP component tree is intentionally shallow:

```text
App
└── DesignerPage
    ├── CardEditor
    │   ├── ContentFields
    │   └── AppearanceFields
    └── CardPreview
        └── ClassicCard
```

- `DesignerPage` owns the current document state and dispatches edit actions.
- `CardEditor` is a controlled form: values arrive through props and edits are reported through callbacks. It should not maintain a second copy of the card.
- `CardPreview` resolves `templateId` through a small, explicit template registry and passes content/settings to the renderer.
- `ClassicCard` only renders. It does not save data or know how the editor works.

Start with ordinary props. Introduce React Context only if deeply nested shared state becomes awkward; do not use context simply to avoid passing one or two props. A router is unnecessary while there is one screen.

## 6. State management

Use `useReducer` in the owning page once edits span several related fields. Reducer actions such as `content/titleChanged`, `appearance/accentColorChanged`, and `document/replaced` make transitions explicit and testable. A few initial fields could use `useState`; moving to a reducer is reasonable before import replaces a whole document.

In C# terms, React state is the view model's current immutable snapshot. Dispatching an action resembles sending a command to a reducer that returns a new record. Never mutate nested state in place; React detects changes primarily through new object references. Derived values (selected template, printable dimensions) should be computed rather than duplicated in state.

No Redux, MobX, Zustand, or server-state library is justified for the MVP. React's built-in state is sufficient, lowers the learning surface, and is easy to replace behind component boundaries if later needs prove otherwise.

## 7. Template evolution

Begin with an explicit registry, for example `const templates = { classic: classicTemplate }`. A registry entry can hold metadata, default settings, validation, and its component. This supports a template picker later without storing a React component in card data.

Card dimensions should be template settings expressed in a print-friendly unit such as millimetres, then surfaced through CSS custom properties. Screen preview may scale that fixed physical canvas responsively; print CSS should remove editor controls and scaling and preserve physical dimensions. Keep printing as CSS/HTML first. Image and PDF export can be investigated later because font loading, rasterization, browser differences, and pagination add meaningful complexity.

Do not create a general-purpose layout DSL or drag-and-drop element tree now. Add typed settings to concrete templates as actual use cases appear. If very different content shapes eventually emerge, introduce versioned content variants or template capabilities based on evidence rather than a speculative inheritance hierarchy.

## 8. Persistence and interchange

The application state should not call `localStorage` directly. Define a narrow asynchronous port so a browser adapter and a future cloud adapter can share the same caller:

```ts
export interface DocumentRepository {
  load(id: string): Promise<CardDocument | undefined>
  save(document: CardDocument): Promise<void>
  remove(id: string): Promise<void>
}
```

An async interface avoids coupling consumers to `localStorage` being synchronous and makes a later Firestore implementation possible. Construct the adapter in the composition root and pass it to the application boundary. JSON import/export is separate from storage: parse an untrusted file, validate and migrate it, then dispatch `document/replaced`; export the versioned document as JSON. Browser storage errors, quota, corrupt data, and schema upgrades must be handled at this boundary.

For multiple cards, introduce a `Project` aggregate only when implementing that feature, likely containing its own ID, schema version, card collection, and project-level metadata. Avoid putting a project singleton into the first card model prematurely.

## 9. C#/.NET comparisons

| React/TypeScript concept | Useful .NET analogy | Important difference |
|---|---|---|
| `.tsx` component | Razor component returning markup | It is a function evaluated from props/state, not a mutable UI control |
| Props | Component parameters / immutable DTO | Data flows downward; callbacks report events upward |
| `useState` | Small view-model property | Setters schedule a render; mutation is not notification |
| `useReducer` | Pure command handler over an immutable record | The reducer must have no I/O or side effects |
| TypeScript `interface` | C# interface/record shape | Erased at runtime; it does not validate JSON |
| Discriminated union | C# records plus exhaustive pattern matching | Narrowed using a literal field such as `type` |
| Vite | build/dev host comparable in role to SDK tooling | It bundles browser modules and supplies a fast dev server |
| `main.tsx` | `Program.cs` composition root | It mounts React into an existing DOM node |
| Repository port | application-layer repository interface | Browser/local adapters are infrastructure, even without a server |

TypeScript's structural typing means matching shape is usually enough; classes and `new` are not needed for plain domain records. `strict: true` provides valuable compiler feedback, but runtime input still requires validation.

## 10. Decisions and trade-offs

| Decision | Reason | Trade-off |
|---|---|---|
| React + TypeScript + Vite | small, conventional client stack with fast feedback | npm/browser tooling is a new ecosystem to learn |
| Plain interfaces and functions | portable, serializable, easy to test | invariants are enforced by factories/validation rather than constructors |
| Built-in React state | no unnecessary dependency | state logic must remain disciplined as the UI grows |
| CSS-based first template and printing | native, accessible, low dependency | exact output can vary between browsers/printer settings |
| Versioned document envelope | enables import/persistence migration | small amount of up-front metadata |
| Persistence interface added with persistence | keeps application independent of storage | a little indirection when storage arrives |
| Fixed Pages base path | correct static asset URLs for this repository | rename/custom-domain deployment requires changing one setting |
| No test/lint framework in smoke test | minimizes setup before behavior exists | add tests and linting alongside meaningful code |

### Decisions to make before implementing the designer

1. Choose the exact MVP semantic fields and whether body content is plain text with preserved line breaks or a deliberately small markup format.
2. Choose the initial physical card dimensions and expected print sheet/pagination behavior.
3. Decide whether appearance colors are per card or shared template defaults. The UI can expose per-card values first, but this affects multiple-card consistency.
4. Define the first template's settings, defaults, constraints, and accessibility contrast expectations.
5. Decide how IDs are created (`crypto.randomUUID()` is suitable in supported modern browsers) and whether duplicate/import keeps or regenerates them.
6. Define validation and schema migration behavior before accepting imported JSON.
7. Select a testing stack when the first reducer and renderer are implemented; Vitest plus React Testing Library is a likely small Vite-native choice, but is not installed yet.
8. Establish supported browsers and how strictly print output must match between them.

These choices do not block the technical skeleton.

## 11. Technical skeleton implemented

The resulting repository structure is:

```text
.
├── .github/workflows/deploy-pages.yml
├── .gitignore
├── README.md
├── docs/initial-architecture.md
├── index.html
├── package-lock.json
├── package.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

### Important file responsibilities

- `package.json` declares only React runtime dependencies and Vite/TypeScript development tooling. `dev`, `build`, and `preview` are the minimal scripts.
- `package-lock.json` pins the resolved dependency graph so local and GitHub Actions installs are repeatable through `npm ci`.
- `index.html` is Vite's HTML entry and provides the React mount element.
- `src/main.tsx` is the composition root that mounts `App` in React strict mode and loads global CSS.
- `src/App.tsx` renders only the requested smoke-test copy; it contains no designer behavior.
- `src/styles.css` supplies a small responsive placeholder presentation and a 320 px minimum supported viewport.
- `tsconfig.json` references separate browser and build-configuration compiler projects. Strict TypeScript checking occurs before every production build.
- `vite.config.ts` enables React and sets the GitHub repository subdirectory base.
- `.github/workflows/deploy-pages.yml` performs locked dependency installation, build, artifact upload, and Pages deployment.
- `.gitignore` excludes dependencies, output, Vite cache, and common machine-local files.
- `README.md` now accurately describes the repository's skeleton status and links here.

## 12. Build and verification results

Environment used: Node.js `v20.20.2`, npm `11.4.2`.

| Check | Result |
|---|---|
| `npm install` | Passed; 68 packages installed, 69 audited, 0 vulnerabilities reported |
| `npm run build` | Passed; TypeScript project build and Vite 8.3.0 production build completed |
| `npm run dev -- --host 127.0.0.1` plus `curl --fail --silent --show-error http://127.0.0.1:5173/rpg-card-designer/` | Passed; Vite served the application at the configured subpath |
| Playwright mobile smoke screenshot at 390 x 844 | Passed; the page rendered its heading and readiness message without visible overflow |
| output inspection | Passed; `dist/index.html`, one CSS asset, and one JavaScript asset were produced |
| Pages base inspection | Passed; generated asset URLs begin with `/rpg-card-designer/` |

The build emitted an environment-level npm warning for an unknown `http-proxy` configuration. It did not affect installation or compilation and is not caused by repository configuration.

The generated `dist/` directory is intentionally ignored; GitHub Actions rebuilds it rather than committing generated files.

## 13. GitHub Pages deployment

The repository directory and requested project name identify the repository as `rpg-card-designer`, so Vite uses `base: '/rpg-card-designer/'`. This makes production JavaScript and CSS URLs resolve beneath a standard project Pages URL such as `https://OWNER.github.io/rpg-card-designer/`.

The workflow triggers on pushes to `main` and can also be run manually. It grants only read-content plus Pages/OIDC deployment permissions, uploads `dist`, and deploys through the protected `github-pages` environment.

### Manual GitHub steps

1. Ensure the GitHub default/deployment branch is named `main`. This local checkout had no configured Git remote, so the owner and remote URL could not be verified.
2. In **Repository Settings -> Pages -> Build and deployment**, choose **GitHub Actions** as the source.
3. Push this commit to `main`, then inspect the **Actions** tab and the deployment URL.

If the repository is renamed, update `base` in `vite.config.ts` to `'/NEW-REPOSITORY-NAME/'`. For an owner site hosted at `OWNER.github.io` or a custom domain at its root, use `'/'` instead. The application currently has one entry route, so no single-page-app history fallback is required.

## 14. Recommended next increment

Implement only the initial `CardContent`/`CardDocument` model, defaults, a reducer, controlled editor fields, one `ClassicCard` renderer, responsive preview, and print CSS. Add reducer and rendering tests at the same time. Defer storage, JSON, multiple documents, image export, and generalized template machinery until the vertical editor-to-preview-to-print slice works.
