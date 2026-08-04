import { notFound } from "next/navigation";

import {
  CURRENT_PRIVACY,
  CURRENT_TOS,
  documentSha256,
} from "@/lib/consent/documents";

const DOCUMENTS = [CURRENT_TOS, CURRENT_PRIVACY];

/**
 * Every consent row stores a document URI; that URI must resolve to the exact
 * text whose hash was recorded, so acceptances are independently verifiable.
 */
export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  const document = DOCUMENTS.find((doc) => doc.version === version);
  if (!document) notFound();
  const sha = await documentSha256(document);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <div className="font-mono text-xs text-muted-foreground">
        version {document.version} · sha256 {sha}
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm">{document.text}</pre>
    </div>
  );
}
