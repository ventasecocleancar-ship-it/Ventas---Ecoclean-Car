---
name: EcoClean audit model
description: Durable product rule for EcoClean Car's sales and cash-control history.
---

Orders are operational records, not disposable cart rows: the original order remains available, each status transition is recorded, and sensitive changes such as price overrides, payments, and cancellations require an attributable audit event.

**Why:** The owner's main goal is to delegate branch operations without losing visibility or allowing sales to disappear from the history.

**How to apply:** Any future order, cash, SII, supervisor, or reporting feature should preserve the original order identity and extend the audit trail instead of overwriting history or adding hard-delete behavior.