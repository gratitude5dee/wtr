import { redirect } from "next/navigation";

import { BulkUpload } from "@/components/dashboard/bulk-upload";
import { PageHeader } from "@/components/dashboard/page-header";
import { hasCurrentConsent } from "@/lib/consent/service";
import { getActingCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function BulkUploadPage() {
  // Same consent gate as the single-file upload: no upload surface without an
  // active acceptance of the CURRENT documents.
  const creator = await getActingCreator();
  if (!creator || !(await hasCurrentConsent(creator.id))) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Creator"
        title="Bulk upload"
        description="Many files at once, with per-file metadata from a manifest — for agents, managers and labels."
      />
      <BulkUpload />
    </div>
  );
}
