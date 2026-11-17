import { describe, it, expect } from "vitest";
import { capexTotal, evenMonths, evenShares, lineMonths, share, sharesComplete, sum } from "@/modules/budgets/budget-math";
import { capexTypeOf, money, parseCapexSheets, parseOpex, priorityOf } from "@/modules/budgets/budget-import-parse";

describe("budget arithmetic", () => {
  it("spreads a year over twelve months that add back up exactly", () => {
    const months = evenMonths(6400);
    expect(months[0]).toBe(533.33);
    expect(months[11]).toBe(533.34);
    expect(sum(months)).toBe(6400);
    expect(sum(evenMonths(1719.99))).toBe(1719.99);
    expect(lineMonths({ amount: 1200, months: null })).toEqual(Array(12).fill(100));
    expect(lineMonths({ amount: 0, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })[11]).toBe(12);
  });

  it("works out CAPEX totals and company shares", () => {
    expect(capexTotal(3, 2166.67, null)).toBe(6500.01);
    expect(capexTotal(20, 650, 150)).toBe(13150);
    expect(share(10000, 33.33)).toBe(3333);
    expect(sharesComplete([50, 30, 20])).toBe(true);
    expect(sharesComplete([33.33, 33.33, 33.33])).toBe(false);
    expect(evenShares(3)).toEqual([33.34, 33.33, 33.33]);
    expect(sharesComplete(evenShares(3))).toBe(true);
  });
});

describe("budget sheets", () => {
  it("reads the IT OPEX layout: unnamed department and vendor columns, twelve months, a remark", () => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const parsed = parseOpex([
      {
        name: "CXR",
        rows: [
          ["#", "", "Product Name", "", ...months, "Total Amount per Year", ""],
          ["1", "Finance", "Sun System - Maintenance", "I-MAS", ...Array(12).fill("533.3333333"), "6400", "Cloud Annual Fee"],
          ["2", "IT", "Internet", "Dhiraagu", ...Array(11).fill("15000"), "20000", "185000", ""],
          ["3", "marketing", "Website", "", ...Array(12).fill(""), "", ""],
        ],
      },
    ])!;
    expect(parsed.lines[0]).toMatchObject({ department: "Finance", vendor: "I-MAS", amount: 6400, months: null, notes: "Cloud Annual Fee" });
    expect(parsed.lines[1]).toMatchObject({ amount: 185000, months: expect.arrayContaining([20000]) });
    expect(parsed.leftOut).toEqual([{ row: 4, text: "Website", reason: "No amount." }]);
  });

  it("reads the CAPEX wish list: sections, groups, priorities and types, newest year first", () => {
    const header = ["", "Ref#", "Description", "Priority Order", "Location Code", "Asset Category", "CAPEX types ", "Status", "Q'ty", "Unit Price", "Item Cost", "Associated Cost", "Total Amount", "Reasons/Justification"];
    const sheets = [
      { name: "2024-BGT Wish List", rows: [header, ["", "IT-01", "Old PC", "", "", "", "", "", "1", "100", "100", "", "100", ""]] },
      {
        name: "BGT 2026 Wish List",
        rows: [
          ["", "TOWNSHIP"],
          ["", " IT DEPARTMENT"],
          header,
          ["", "", "HARDWARE"],
          ["", "IT-02", "UniFi U6-Pro Access Point", "First Priority", "HR", "", "New Operation Enhancement", "", "5", "400", "2000", "", "2000", "Staff Wi-Fi"],
          ["", "IT-11", "Cisco C1000 24P", "Wish List", "", "", "C", "", "3", "2166.666667", "6500", "", "6500", ""],
          ["", "", "Grand Total IT", "", "", "", "", "", "", "", "", "", "8500", ""],
        ],
      },
    ];
    const all = parseCapexSheets(sheets);
    expect(all.map((p) => p.sheet)).toEqual(["BGT 2026 Wish List", "2024-BGT Wish List"]);
    expect(all[0]!.lines).toHaveLength(2);
    expect(all[0]!.lines[0]).toMatchObject({
      reference: "IT-02", department: "IT", category: "Hardware", quantity: 5, unitPrice: 400, amount: 2000,
      priority: "FIRST", capexType: "NEW_OPERATION", locationCode: "HR", justification: "Staff Wi-Fi",
    });
    // A unit price worked out by division keeps the sheet's total.
    expect(all[0]!.lines[1]).toMatchObject({ unitPrice: 2166.67, amount: 6500, priority: "WISH_LIST", capexType: "REGULAR_REPLACEMENT" });
    expect(money("$ 1,200.50")).toBe(1200.5);
    expect(priorityOf("Please Select")).toBeNull();
    expect(capexTypeOf("Cost Saving")).toBe("COST_SAVING");
  });
});
