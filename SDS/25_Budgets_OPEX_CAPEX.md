# Document 25: IT Budgets (OPEX and CAPEX)

Added 18 November 2026. Scope recorded in Document 00 §14.

## Purpose
Prepare each year's IT running costs (OPEX) and purchases (CAPEX) in
one place, split between the companies that pay for them, and take them
through approval with a full audit trail. Axivo does not do accounting,
purchasing or spend tracking; budgets are the plan, not the books.

## Budgets
- One OPEX and one CAPEX budget per year. Every amount is in USD.
- A budget is organisation-wide. Each line says which companies pay for
  it and what share, in percent; the shares add up to 100. A company's
  totals count only its share of each line.
- A new budget can start empty or as a copy of an earlier budget of the
  same kind: every line comes across with its split, ready to adjust.
- A draft can be deleted. A submitted or approved one cannot.

## Lines
- Every line has a description, and may have a reference (IT-04), a
  vendor (from Settings → Vendors), a category, who uses it (Used by: IT, HR, Front Office; suggested from the budget's other lines) and
  notes.
- OPEX: the amount for the year, spread evenly over the twelve months
  (in cents, the remainder on the last months so the year adds up), or
  twelve amounts entered per month, whose sum is the year.
- CAPEX: quantity × unit price plus an associated cost (shipping,
  installation) is the line's amount. Priority (First priority, Medium
  priority, Wish list), CAPEX type (Revenue generating, Cost saving,
  Regular replacement, New operation enhancement, Other), the quarter
  it is needed in, and the reason or justification.

## Status and approval
| Step | From | To | Permission | Reason |
|---|---|---|---|---|
| Submit | Draft | Submitted | budgets.manage | No (needs a line) |
| Approve | Submitted | Approved | budgets.approve | No |
| Return to draft | Submitted | Draft | budgets.approve | Required |
| Reopen | Approved | Draft | budgets.approve | Required |

Only a draft can be changed. There are no saved revisions: the audit
trail records every line added, changed (field by field, including the
split) or removed, and every step with its reason.

## Screens
- Budgets: each year's OPEX and CAPEX with the total, the status and
  each company's share.
- A budget: the total and each company's share, OPEX totals by month,
  and the lines, by year or month by month. Used by only says whose
  application or service it is; it is not totalled.
  A search box (filtering as you type) finds lines by item, reference,
  vendor, category, used by, justification or note.
  Choosing a company shows only the lines it pays for, at its share.
- Each line has a note icon: pointing at it shows the note, or "No notes
  added".
- Export downloads what is on screen (the chosen company's share and the
  search) as a workbook: OPEX month by month with the year, CAPEX with
  quantities, prices, priority, type and justification. Each export is
  audited.

## Import
- Import lines (draft only) reads the IT OPEX sheet as it is: a
  description column with twelve month columns, who uses it (a Used by
  column, or the department in the unnamed column before the
  description), the vendor in the column after the description, the
  yearly total and a remark (kept as the line's note). Equal months
  become an even spread;
  rows without an amount are listed and left out. Vendors not yet known
  are added to Settings.
- For CAPEX it reads the wish list as it is: sections (such as IT
  DEPARTMENT), each with its own heading row (Ref#, Description, Priority
  Order, Location Code or Used by, Asset Category, CAPEX types, Q'ty, Unit Price, Associated Cost,
  Total Amount, Reasons/Justification), and groups such as HARDWARE,
  which become the category. Used by is the Location Code, or the
  section when the item gives none. Totals rows are skipped. When a workbook
  holds several lists, the newest year is read first and another can be
  chosen. Where a unit price was worked out by division, the sheet's
  total is kept.
- Every imported line gets the split chosen on import; single lines are
  changed afterwards.
- Each import offers a sample file with the headings it reads and two
  example rows, and a "How to fill" tab that the import ignores.
- No export in the corporate template layout.

## Permissions
| Permission | Default roles |
|---|---|
| budgets.view | System Admin, IT Admin |
| budgets.manage | System Admin, IT Admin |
| budgets.approve | System Admin |
