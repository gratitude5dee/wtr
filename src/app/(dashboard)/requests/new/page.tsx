import { notFound } from "next/navigation";

import { RequestForm } from "@/components/dashboard/request-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const creator = await getCurrentCreator();
  if (!creator) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Post a data request</h1>
      <p className="text-sm text-muted-foreground">
        Creators whose listed work matches your license terms will see this brief and
        submit. You review submissions and accept the ones you want — a sale still
        settles through each creator&apos;s license, never around it.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>The brief</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestForm />
        </CardContent>
      </Card>
    </div>
  );
}
