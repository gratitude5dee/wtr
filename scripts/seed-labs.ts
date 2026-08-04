/**
 * Seeds a realistic set of lab data requests for demos.
 *
 *   npm run seed:labs
 *
 * Idempotent — a brief is skipped when a request with the same title already
 * exists. These are demonstration briefs styled after real labs; they are not
 * affiliated with or endorsed by the named companies.
 */
import { closePool, db } from "../src/lib/db/pool";
import { log } from "../src/lib/log";
import { toWei } from "../src/lib/money";

interface LabBrief {
  lab: string;
  title: string;
  modality: string;
  notes: string;
  preset: string;
  budgetIp: string;
  unitPriceIp: string | null;
  kycRequired: boolean;
  deadlineDays: number | null;
}

const BRIEFS: LabBrief[] = [
  {
    lab: "OpenAI",
    title: "Long-form conversational speech, consented, 44.1kHz+",
    modality: "audio",
    notes:
      "Natural two-person conversations, 10+ minutes, minimal background noise. Consent chain must be intact; no broadcast or scraped material.",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "120",
    unitPriceIp: "0.8",
    kycRequired: true,
    deadlineDays: 45,
  },
  {
    lab: "Anthropic",
    title: "Hand-written documents and margin notes, scanned at 600dpi",
    modality: "image",
    notes:
      "Handwriting diversity matters more than volume: multiple scripts, pens, papers. No personal identifying content in the documents themselves.",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "80",
    unitPriceIp: "0.25",
    kycRequired: true,
    deadlineDays: 60,
  },
  {
    lab: "Google",
    title: "Multilingual street signage and storefronts, geotag-stripped",
    modality: "image",
    notes:
      "Signage in 20+ languages, varied lighting and weather. EXIF/GPS must be stripped (WTR strips on upload by construction).",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "150",
    unitPriceIp: "0.15",
    kycRequired: false,
    deadlineDays: 90,
  },
  {
    lab: "Mistral",
    title: "Spoken French dialects and regional accents",
    modality: "audio",
    notes:
      "Metropolitan and overseas French variants, read and spontaneous speech. Per-speaker consent required.",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "60",
    unitPriceIp: "0.5",
    kycRequired: false,
    deadlineDays: 45,
  },
  {
    lab: "Suno",
    title: "Original instrument stems: drums, bass, keys — exclusive",
    modality: "audio",
    notes:
      "Unreleased, self-recorded stems only. Exclusive license: the work must not be licensed to another model trainer while this holds.",
    preset: "WTR-TRAIN-EXCLUSIVE",
    budgetIp: "200",
    unitPriceIp: "2",
    kycRequired: true,
    deadlineDays: 30,
  },
  {
    lab: "Black Forest Labs",
    title: "Studio photography with controlled lighting setups",
    modality: "image",
    notes:
      "Product and still-life photography with documented lighting. RAW-derived exports preferred; degraded previews reviewed first.",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "90",
    unitPriceIp: "0.4",
    kycRequired: false,
    deadlineDays: 60,
  },
  {
    lab: "Alibaba",
    title: "Short-form product demonstration video, 1080p+",
    modality: "video",
    notes:
      "15–60 second clips demonstrating physical products. No third-party branding in frame; creator must own the footage outright.",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "110",
    unitPriceIp: "1",
    kycRequired: true,
    deadlineDays: 75,
  },
  {
    lab: "ByteDance",
    title: "Vertical-format dance and movement clips with motion variety",
    modality: "video",
    notes:
      "9:16 clips, single subject, full body in frame. Every person appearing must have signed consent on file.",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "130",
    unitPriceIp: "0.9",
    kycRequired: true,
    deadlineDays: 45,
  },
  {
    lab: "Netflix",
    title: "Ambient room tone and location sound beds, 96kHz",
    modality: "audio",
    notes:
      "Interior and exterior beds, 2+ minutes each, slated with location type (not address). Broadcast-quality noise floor.",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "70",
    unitPriceIp: "0.6",
    kycRequired: false,
    deadlineDays: 90,
  },
  {
    lab: "Amazon",
    title: "Household object 3D scans with clean topology",
    modality: "threed",
    notes:
      "Photogrammetry or structured-light scans of everyday objects, watertight meshes preferred, no branded products.",
    preset: "WTR-TRAIN-NONEXCLUSIVE",
    budgetIp: "160",
    unitPriceIp: "3",
    kycRequired: false,
    deadlineDays: 120,
  },
];

async function main(): Promise<void> {
  let seeded = 0;
  for (const brief of BRIEFS) {
    const existing = await db.query<{ id: string }>(
      "SELECT id FROM data_request WHERE title = $1 LIMIT 1",
      [brief.title],
    );
    if (existing.rows[0]) {
      log.info("brief already seeded — skipping", { lab: brief.lab, title: brief.title });
      continue;
    }
    const deadline =
      brief.deadlineDays === null
        ? null
        : new Date(Date.now() + brief.deadlineDays * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO data_request
         (requester_anon_id, title, spec, license_preset, budget_wei,
          unit_price_wei, kyc_required, deadline)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)`,
      [
        brief.lab,
        brief.title,
        JSON.stringify({ modality: brief.modality, notes: brief.notes }),
        brief.preset,
        toWei(brief.budgetIp).toString(),
        brief.unitPriceIp === null ? null : toWei(brief.unitPriceIp).toString(),
        brief.kycRequired,
        deadline,
      ],
    );
    seeded += 1;
    log.info("lab brief seeded", { lab: brief.lab, title: brief.title });
  }
  log.info("seed-labs done", { seeded, total: BRIEFS.length });
  await closePool();
}

main().catch((error: Error) => {
  log.error("seed-labs failed", { error: error.message });
  process.exit(1);
});
