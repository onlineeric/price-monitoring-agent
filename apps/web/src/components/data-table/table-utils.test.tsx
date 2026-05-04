import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import { withDndColumn } from "./table-utils";

/**
 * withDndColumn is one line, but tables across the dashboard rely on the
 * drag column always being the *first* column (so the grip handle aligns
 * with row reordering). Pin both ordering and identity so a future helper
 * cannot quietly demote it.
 */

describe("withDndColumn", () => {
  it("prepends the drag column so the grip handle is column 0", () => {
    const columns: ColumnDef<{ id: string }>[] = [
      { id: "name", header: "Name" },
      { id: "price", header: "Price" },
    ];

    const result = withDndColumn(columns);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("drag");
    expect(result[1].id).toBe("name");
    expect(result[2].id).toBe("price");
  });

  it("does not mutate the input array", () => {
    const columns: ColumnDef<{ id: string }>[] = [{ id: "name", header: "Name" }];
    const before = [...columns];

    withDndColumn(columns);

    expect(columns).toEqual(before);
  });
});
