import { ApplicationDetailSkeleton } from "@/components/applications/application-detail-skeleton";

export default function ApplicationLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ApplicationDetailSkeleton />
    </div>
  );
}
