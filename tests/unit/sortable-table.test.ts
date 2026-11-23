import { describe, expect, it } from "vitest";
import { compareSortValues } from "@/shared/ui/sortable-table";

const sortBy = (values: (string | number | null)[], dir: "asc" | "desc") =>
  [...values].sort((a, b) => compareSortValues(a, b, dir));

describe("compareSortValues", () => {
  it("sorts numbers as numbers, so IP addresses turned into numbers come out in address order", () => {
    expect(sortBy([175_000_010, 175_000_009, 175_000_100], "asc")).toEqual([175_000_009, 175_000_010, 175_000_100]);
  });

  it("sorts text with numbers in it naturally", () => {
    expect(sortBy(["SW10", "SW2", "SW1"], "asc")).toEqual(["SW1", "SW2", "SW10"]);
    expect(sortBy(["SW10", "SW2", "SW1"], "desc")).toEqual(["SW10", "SW2", "SW1"]);
  });

  it("keeps empty values at the bottom whichever way the column is sorted", () => {
    expect(sortBy([null, "B", "", "A"], "asc").slice(0, 2)).toEqual(["A", "B"]);
    expect(sortBy([null, "B", "", "A"], "desc").slice(0, 2)).toEqual(["B", "A"]);
  });
});
