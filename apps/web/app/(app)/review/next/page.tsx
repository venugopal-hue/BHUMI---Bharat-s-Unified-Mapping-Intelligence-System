"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { EmptyState, LoadingState } from "@/components/ui/primitives";
import { reviewApi } from "@/lib/api";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

/**
 * Redirect page: picks the next open queue item and sends the verifier straight
 * to the review console. The "Start reviewing" button on the queue page lands here
 * so the user never has to manually select the next record.
 */
export default function ReviewNextPage() {
  const router = useRouter();
  const params = useSearchParams();
  const queueType = params.get("queue_type") ?? undefined;

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ["review", "next", queueType],
    queryFn: () => reviewApi.next(queueType),
    retry: 1,
  });

  useEffect(() => {
    if (item?.record_id) {
      router.replace(`/review/${item.record_id}`);
    }
  }, [item, router]);

  if (isLoading) return <LoadingState label="Finding next record…" />;

  if (isError) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        title="Could not load queue"
        description="There was a problem fetching the next record. Please try again."
        action={<Link href="/review" className="btn-secondary">Back to queue</Link>}
      />
    </div>
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        title="Queue is clear"
        description="Every record has been verified or is being handled by another verifier."
        icon={CheckCircle2}
        action={
          <Link href="/review" className="btn-secondary">
            Back to queue
          </Link>
        }
      />
    </div>
  );
}
