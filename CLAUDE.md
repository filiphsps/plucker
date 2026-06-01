# Plucker

## Package manager

Use **pnpm** for every command (install, scripts, adding deps). Never use `npm` or `npx` — use `pnpm` and `pnpm dlx`.

## Specs & plans

Write all specs, plans, and design docs to the **`.specs/`** folder. This overrides any skill's default location (e.g. `docs/superpowers/specs`, `docs/superpowers/plans`) — always use `.specs/` instead.

## Conventions

Infer toolchain details (Node version, dependencies, scripts) from `package.json` rather than assuming.
