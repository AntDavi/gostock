import { Suspense } from "react";
import { PageSkeleton } from "@/ui/common/PageState";
import { SkuPage } from "@/ui/pages/SkuPage";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SkuPage />
    </Suspense>
  );
}
