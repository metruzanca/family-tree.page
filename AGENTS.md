# AGENTS.md

## Rules

- Use conventional commits (`feat:`, `fix:`, `chore:`, ...) and commit in small, frequent increments.
- never leave uncommitted changes
- once finished implementing a feature, push to main to trigger a new deploy
- Add a `data-testid` to every new or changed interactive element and named container. Use kebab-case (`<area>-<element>`) and append the record id for repeated items. Keep existing `id` attributes untouched.
