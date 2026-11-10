---
name: EcoClean audit model
description: Durable product rule for EcoClean Car's sales and cash-control history.
---

Orders are operational records, not disposable cart rows: the original order remains available, each status transition is recorded, and sensitive changes such as price overrides, payments, and cancellations require an attributable audit event.

**Why:** The owner's main goal is to delegate branch operations without losing visibility or allowing sales to disappear from the history.

**How to apply:** Any future order, cash, SII, supervisor, or reporting feature should preserve the original order identity and extend the audit trail instead of overwriting history or adding hard-delete behavior.

Access follows the same separation: the administrator owns user creation and removal, while deleting a person's Clerk access must not delete the operational records or audit events they created.

**Why:** Staff turnover is expected, but the business still needs the complete history of orders and cash actions after a collaborator leaves.

**How to apply:** Use administrator-controlled invitations and role metadata for staff access; keep passwords and authentication lifecycle in Clerk, not in the EcoClean database.

Order creation supports selecting multiple catalog services while retaining the current single-order schema: store the selected service names together and save the server-calculated combined total. If future work needs item-level reporting, editing, or discounts, introduce explicit order-service rows rather than parsing the combined display name.

**Why:** The requested workflow needs one order with a correct combined price, and adding a line-item table is unnecessary schema work until item-level operations are required.

**How to apply:** Keep price calculation server-owned and preserve existing order history; expand to a normalized line-item model only when downstream features need per-service data.