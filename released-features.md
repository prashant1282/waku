# Released Features

**Uzera** by GainServ

The five feature names below are mapped to the product areas as they actually appear in the live app:

| Feature name | In-app product area |
| --- | --- |
| Context | Knowledge Base / Sources / Memory |
| Guardrails | Rules |
| Code Health | Code Health |
| Trust | Governance |
| Code Review | Code Review |

---

## Context

Uzera's Context engine turns a codebase into living knowledge that any AI coding agent can query in real time. A built-in scanner maps every module into structured, function-level detail, capturing how the code actually behaves rather than relying on outdated documentation. That knowledge is then delivered to Claude, Cursor, Copilot, Windsurf, or any MCP-compatible agent through a single integration, so every assistant a team uses works from the same accurate, continuously refreshed understanding of the codebase.

**Use it when:** onboarding a new AI assistant onto an existing codebase, answering questions like "how does login work" or "what calls `PaymentService`," or ensuring AI-generated code follows existing conventions instead of guessing from stale README files.

---

## Guardrails

Guardrails are the enforceable rules that keep AI-generated code aligned with a team's standards before it ever reaches a repository. Built on rule templates covering JavaScript, TypeScript, Node.js, C#, and general security best practices, each rule is classified as blocking, warning, or informational, and enforced through hooks that intercept an agent's actions as they happen. When a proposed edit violates a rule, Uzera blocks it and the agent is prompted to fix and retry automatically, catching problems at the moment of creation rather than during later cleanup.

**Use it when:** preventing common issues such as unsafe SQL, hard-coded secrets, or missing type safety, and giving every AI agent on a team a consistent rulebook regardless of which tool an individual developer prefers.

---

## Code Health

Code Health is the measurable record of what AI is actually doing to a codebase over time. It tracks the full lifecycle of every AI edit — issues caught and resolved before landing, new issues that slipped through, issues later cleaned up, and the remaining backlog — broken down by repository and developer and expressed as a density score relative to lines of code. Instead of relying on gut feeling, it gives engineering leaders an evidence-based view of whether AI-assisted development is improving or eroding quality.

**Use it when:** running sprint reviews or quarterly audits to see whether AI-assisted work is trending cleaner or messier, and to identify which repos or contributors need tighter enforcement.

---

## Trust

> Shown in-app as **"Governance"**

Trust is Uzera's tamper-evident audit trail of every action an AI agent takes. Each event, allowed or blocked, records the acting agent, the responsible user, the action taken, and the exact rule that made the call, creating a verifiable record that can't be altered after the fact. This turns AI-assisted coding from a black box into something engineering and security teams can stand behind.

**Use it when:** preparing for a security or compliance review, investigating why an agent made a specific change, or demonstrating to stakeholders that AI coding activity is fully auditable rather than unsupervised.

---

## Code Review

Code Review extends Uzera's rule enforcement to the pull request stage, checking every push against a team's adopted rules and surfacing findings before a human reviewer opens the diff. It tracks watched repositories, open pull requests, PRs needing attention, and PRs with blocking issues, giving reviewers a prioritized queue rather than a flat list to work through.

**Use it when:** catching rule violations at the PR gate so human reviewers can focus on architecture and logic, and preventing blocking issues from merging without extra scrutiny.

---

## Notes on sourcing

This copy was written from exploration of the live app. At the time of writing, the workspace had no scans, rules, or PRs adopted, so behavior was inferred from the descriptive copy, empty-state text, and rule templates shown in the UI rather than from live data. Adopting a rule template or triggering a scan would allow these descriptions to be validated against real output.
