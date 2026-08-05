import Link from "next/link";
import { notFound } from "next/navigation";

import { RequestForm } from "@/components/dashboard/request-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const creator = await getCurrentCreator();
  if (!creator) notFound();

  // The same gate `createRequest` enforces, said up front rather than after a
  // whole brief has been typed out.
  if (!creator.labVerified) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold">Post a data request</h1>
        <Card>
          <CardHeader>
            <CardTitle>Verified labs only</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Briefs come from verified labs, so creators know who is asking. This
              account is not verified yet.
            </p>
            <p>
              Ask the WTR team to verify it and this form opens up. Nothing else is
              blocked meanwhile — browse the{" "}
              <Link className="underline" href="/catalog">
                catalog
              </Link>{" "}
              and the open briefs.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
