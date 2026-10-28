import { Suspense } from "react";
import { PageSkeleton } from "@/ui/common/PageState";
import { StockPage } from "@/ui/pages/StockPage";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockPage />
    </Suspense>
  );
}
