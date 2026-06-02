# `pl-dl-plugins` — repo-local Claude Code plugins

Vendored so a fresh clone of Plucker gets code intelligence with **no global
config required**. Two LSP plugins, registered as a directory marketplace in
`.claude/settings.json`:

- **`typescript-lsp`** — `typescript-language-server` for `.ts/.tsx/.js/.jsx`
  and friends. Powers go-to-definition, find-references, hover, and diagnostics.
- **`tailwind-lsp-adapter`** — `@tailwindcss/language-server` (via the adapter)
  for class completions, hover, and diagnostics. Plucker uses Tailwind v4
  (`@tailwindcss/vite`).

Both run through `pnpm dlx`, so the first invocation fetches the pinned server
versions; later sessions reuse the pnpm store. No repo dependency is added.

## Why vendor instead of relying on global plugins?

Previously these LSPs were available only through a `commerce-plugins`
marketplace whose source path lived inside a _different_ repo
(`~/commerce/.claude/plugins/…`). That made code intelligence in this project
depend on an unrelated checkout existing on disk. Vendoring a copy here removes
that cross-repo coupling.

If you also have the `commerce-plugins` entries enabled in your **global**
`~/.claude/settings.json`, you can remove `typescript-lsp@commerce-plugins` and
`tailwind-lsp-adapter@commerce-plugins` (and the `commerce-plugins` marketplace)
to avoid running duplicate servers for the same files — this repo no longer
needs them.
