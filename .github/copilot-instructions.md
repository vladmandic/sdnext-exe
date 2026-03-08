# Copilot Instructions

## MUST

- Keep edits minimal, focused, and consistent with existing style.
- Update all related code needed to keep behavior and consistency correct.
- Read the full chain of related files (not just first match).
- Check architecture conflicts early before editing.
- Assume Windows development, but keep code cross-platform.
- Limit code changes to `src/` unless explicitly requested otherwise.
- After code edits, run `npm run typecheck` and `npm run lint`.
- Ask for clarification before editing when requirements are conflicting, risky, or broader than requested scope.
- If the same issue fails twice, switch to full end-to-end tracing: *main -> IPC -> preload -> renderer*.
- Remove temporary debug logs before finalizing unless explicitly asked to keep them.
- Update `CHANGELOG.md` with each change: each update should always be single line with timestamp, type of a change, area of a change, brief description. For example: `2024-06-01 12:00: [Feature] [UI] Added new theme toggle button`.

## MUST NOT

- Never read, inspect, or modify `sdnext/`.
- Do not touch `portable/`, `dist/`, or other generated/runtime data unless explicitly requested.
