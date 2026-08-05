/**
 * Export templates for a dataset snapshot, plus the provenance-backed dataset
 * card that ships with every export.
 *
 * What leaves the building is metadata only: asset ids, content hashes, public
 * labels, degraded-preview URLs and license terms. No plaintext original, no
 * decryption key and no PII — the card is assembled from the same trace-v1.0
 * document the pipeline sends to Trace, and is run through `assertNoPii`
 * before it is rendered.
 */
import { db, type Queryable } from "../db/pool";
import { PgAssetStore } from "../pipeline/pg-store";
import { buildTraceDocument } from "../pipeline/trace-document";
import { assertNoPii, type TraceDocument } from "../trace/schema";

import {
  DatasetError,
  getDataset,
  getSnapshot,
  preferencePairsForAssets,
  snapshotMembers,
  type DatasetMember,
  type DatasetRow,
  type DatasetSnapshotRow,
  type PreferencePairRow,
} from "./service";

export const EXPORT_TEMPLATES = ["sft_jsonl", "caption_pairs", "dpo_pairs"] as const;
export type ExportTemplate = (typeof EXPORT_TEMPLATES)[number];

export const EXPORT_TEMPLATE_LABEL: Record<ExportTemplate, string> = {
  sft_jsonl: "SFT (chat JSONL)",
  caption_pairs: "Caption pairs",
  dpo_pairs: "DPO preference pairs",
};

export function isExportTemplate(value: string): value is ExportTemplate {
  return (EXPORT_TEMPLATES as readonly string[]).includes(value);
}

export interface DatasetExportInput {
  dataset: DatasetRow;
  snapshot: DatasetSnapshotRow;
  members: DatasetMember[];
  preferencePairs?: PreferencePairRow[];
  /** trace-v1.0 documents for the members, used for the provenance card. */
  traceDocuments?: TraceDocument[];
}

export interface DatasetExport {
  template: ExportTemplate;
  filename: string;
  contentType: string;
  /** JSON Lines — one record per line, empty string when there are none. */
  body: string;
  lineCount: number;
  /** Markdown dataset card. */
  card: string;
}

const CAPTION_KEYS = ["caption", "description", "summary", "alt_text"];

function captionFor(member: DatasetMember): string {
  for (const key of CAPTION_KEYS) {
    const value = member.labels[key];
    if (value && value.trim()) return value.trim();
  }
  const descriptive = Object.entries(member.labels)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${key}: ${value}`)
    .sort();
  return descriptive.join(", ");
}

function promptFor(member: DatasetMember): string {
  return `Describe this ${member.modality} sample.`;
}

function jsonl(records: unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

function provenanceOf(member: DatasetMember) {
  return {
    asset_id: member.assetId,
    content_sha256: member.contentSha256,
    license_preset: member.licensePreset,
    creator_anon_id: member.creatorAnonId,
    ip_id: member.ipId,
  };
}

function sftRecords(members: DatasetMember[]): unknown[] {
  return members
    .map((member) => ({ member, caption: captionFor(member) }))
    .filter(({ caption }) => caption.length > 0)
    .map(({ member, caption }) => ({
      messages: [
        { role: "user", content: promptFor(member) },
        { role: "assistant", content: caption },
      ],
      provenance: provenanceOf(member),
    }));
}

function captionRecords(members: DatasetMember[]): unknown[] {
  return members
    .map((member) => ({ member, caption: captionFor(member) }))
    .filter(({ caption }) => caption.length > 0)
    .map(({ member, caption }) => ({
      modality: member.modality,
      // The degraded preview — never the plaintext original.
      preview_url: member.previewUrl,
      caption,
      provenance: provenanceOf(member),
    }));
}

function dpoRecords(pairs: PreferencePairRow[]): unknown[] {
  return pairs.map((pair) => ({
    prompt: pair.prompt,
    chosen: pair.chosen,
    rejected: pair.rejected,
    confidence: pair.confidence,
    jurors: pair.jurors,
    provenance: { asset_id: pair.assetId },
  }));
}

export function buildExport(
  template: string,
  input: DatasetExportInput,
): DatasetExport {
  if (!isExportTemplate(template)) {
    throw new DatasetError(`unknown export template "${template}"`);
  }
  const records =
    template === "sft_jsonl"
      ? sftRecords(input.members)
      : template === "caption_pairs"
        ? captionRecords(input.members)
        : dpoRecords(input.preferencePairs ?? []);

  return {
    template,
    filename: `${slug(input.dataset.name)}-${input.snapshot.id.slice(0, 8)}-${template}.jsonl`,
    contentType: "application/x-ndjson",
    body: jsonl(records),
    lineCount: records.length,
    card: datasetCard(template, input, records.length),
  };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dataset";
}

/**
 * The provenance card. Every claim in it is sourced from the snapshot and from
 * the assets' trace-v1.0 documents, so a buyer can audit the export against
 * Trace rather than taking the file at face value.
 */
export function datasetCard(
  template: ExportTemplate,
  input: DatasetExportInput,
  lineCount: number,
): string {
  const docs = input.traceDocuments ?? [];
  for (const doc of docs) assertNoPii(doc);

  const presets = new Map<string, number>();
  for (const member of input.members) {
    presets.set(member.licensePreset, (presets.get(member.licensePreset) ?? 0) + 1);
  }
  const modalities = new Map<string, number>();
  for (const member of input.members) {
    modalities.set(member.modality, (modalities.get(member.modality) ?? 0) + 1);
  }
  const contributors = new Set(input.members.map((member) => member.creatorAnonId));

  const lines: string[] = [
    `# ${input.dataset.name}`,
    "",
    `Export template: **${EXPORT_TEMPLATE_LABEL[template]}** (\`${template}\`)`,
    `Snapshot: \`${input.snapshot.id}\` taken ${input.snapshot.createdAt.toISOString()}`,
    `Records: ${lineCount} across ${input.members.length} asset(s) from ${contributors.size} pseudonymous contributor(s)`,
    "",
    "## Filters",
    "",
    "```json",
    JSON.stringify(input.snapshot.filters, null, 2),
    "```",
    "",
    "## License posture",
    "",
    "Every asset carries an active listing whose terms permit AI training;",
    "`WTR-NO-TRAIN` work is excluded at query time and again at export time.",
    "",
    ...[...presets.entries()].sort().map(([preset, count]) => `- ${preset}: ${count}`),
    "",
    "## Modalities",
    "",
    ...[...modalities.entries()].sort().map(([modality, count]) => `- ${modality}: ${count}`),
    "",
    "## Provenance",
    "",
    "Contributors are identified by pseudonym only. Each row below is the",
    "content hash the creator registered, as carried in its Trace document.",
    "",
    "| asset | content_sha256 | contributor | ip_id |",
    "| --- | --- | --- | --- |",
    ...input.members.map(
      (member) =>
        `| \`${member.assetId}\` | \`${member.contentSha256}\` | \`${member.creatorAnonId}\` | ${member.ipId ? `\`${member.ipId}\`` : "—"} |`,
    ),
  ];

  if (docs.length > 0) {
    lines.push(
      "",
      "## Trace documents",
      "",
      `${docs.length} trace-v1.0 document(s) backed this card:`,
      "",
      ...docs.map(
        (doc) =>
          `- \`${doc.file.content_sha256}\` — ${doc.file.media_category}, contributor \`${doc.contributor.anon_id}\` (kyc: ${doc.contributor.kyc_status})`,
      ),
    );
  }

  if (template === "dpo_pairs" && lineCount === 0) {
    lines.push(
      "",
      "## Note",
      "",
      "No preference pairs have been judged for these assets yet, so this export is empty.",
    );
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Loads a snapshot's frozen membership and renders one export template.
 * Missing preference pairs (or a database where migration 0009 has not landed)
 * produce an empty DPO export rather than an error.
 *
 * `withTraceDocuments` gates the provenance section of the card: building it
 * costs ~8 queries per asset, so a plain data download never pays for text it
 * throws away.
 */
export async function exportSnapshot(
  snapshotId: string,
  template: string,
  q: Queryable = db,
  options: { withTraceDocuments?: boolean } = {},
): Promise<DatasetExport> {
  if (!isExportTemplate(template)) {
    throw new DatasetError(`unknown export template "${template}"`);
  }
  const snapshot = await getSnapshot(snapshotId, q);
  if (!snapshot) throw new DatasetError("that snapshot no longer exists");
  const dataset = await getDataset(snapshot.datasetId, q);
  if (!dataset) throw new DatasetError("that dataset no longer exists");

  const members = await snapshotMembers(snapshot, q);
  // Pairs are drawn from the re-validated members, not the frozen id list: an
  // asset whose terms flipped to WTR-NO-TRAIN after the snapshot must take its
  // preference pairs out of the export with it.
  const preferencePairs =
    template === "dpo_pairs"
      ? await preferencePairsForAssets(
          members.map((member) => member.assetId),
          q,
        )
      : [];
  const traceDocuments = options.withTraceDocuments
    ? await loadTraceDocuments(
        members.map((member) => member.assetId),
        q,
      )
    : [];
  return buildExport(template, { dataset, snapshot, members, preferencePairs, traceDocuments });
}

/** Trace documents are best-effort provenance: one unreadable asset must not sink an export. */
async function loadTraceDocuments(
  assetIds: readonly string[],
  q: Queryable,
): Promise<TraceDocument[]> {
  const store = new PgAssetStore(q);
  const documents: TraceDocument[] = [];
  for (const assetId of assetIds) {
    try {
      documents.push(await buildTraceDocument(store, assetId));
    } catch {
      // An asset whose creator/consent rows are incomplete is simply omitted
      // from the provenance section; its membership row still lists its hash.
    }
  }
  return documents;
}
