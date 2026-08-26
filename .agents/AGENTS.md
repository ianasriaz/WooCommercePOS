# Workspace Rules for WooCommerce POS

## 🚨 MANDATORY STRICT CHANGELOG RULE

Every time ANY implementation, bug fix, UI change, architectural adjustment, or feature update is made to this codebase, you **MUST ALWAYS** update `.docs/AI_CHANGELOG.md` with a detailed entry BEFORE completing the task, even if the user does NOT explicitly ask to report it.

### Required Entry Format in `.docs/AI_CHANGELOG.md`:
```markdown
## [YYYY-MM-DD] <Descriptive Title of Change>

### What changed
- Detailed bullet points of every UI, logic, or state change made.

### Why
- Root cause or feature requirement explaining why the change was necessary.

### Files Touched
- List of every file modified or added (e.g. `src/pages/PosTerminal.jsx`, `src/store/usePosStore.js`)

### Verification Performed
- Test commands run (e.g. `npm run build`), outcome, and visual validation.
```

## Core Architectural Priorities
1. **0ms SWR Local-First Display**: Immediately hydrate cached state from IndexedDB without blocking UI.
2. **Minimum Server Load**: Use delta sync (`modified_after`) and avoid unthrottled/un-cached background queries.
3. **Pure State & Clean Reconcile**: Treat server as authoritative for synced items while preserving local optimistic state during in-flight operations.
