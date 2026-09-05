import { Card } from "@/components/app-shell";
import { classNames } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={classNames("animate-pulse rounded-xl bg-accent/70", className)}
    />
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Card>
        <Skeleton className="h-5 w-40 rounded-lg" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-12 rounded-2xl" />
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-4 w-48 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-32 rounded-lg" />
      </Card>
      <Card>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-4 w-40 rounded-lg" />
      </Card>
      <Card>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-4 w-44 rounded-lg" />
      </Card>
    </div>
  );
}
