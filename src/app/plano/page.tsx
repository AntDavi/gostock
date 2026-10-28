import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanPage } from "@/ui/plan/PlanPage";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <PlanPage />
    </Suspense>
  );
}
