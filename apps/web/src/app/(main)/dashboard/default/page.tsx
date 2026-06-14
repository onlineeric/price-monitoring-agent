import { ChartAreaInteractive } from "./_components/chart-area-interactive";
import data from "./_components/data.json";
import { DataTable } from "./_components/data-table";
import { SectionCards } from "./_components/section-cards";

// NOTE (feature 007 / FR-014): this dashboard overview still renders the
// template's placeholder `data.json` via a generic DataTable, NOT real
// products. When this page is wired to the real product listing, the shared
// product detail view to reuse is
// `app/(main)/dashboard/products/_components/product-detail-dialog.tsx`
// (already consumed by the Products card + table views) — do not build a
// second detail dialog here.
export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <SectionCards />
      <ChartAreaInteractive />
      <DataTable data={data} />
    </div>
  );
}
