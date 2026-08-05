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
  fundingMode: "none" | "deposit" | "full";
  /** Deposit for `deposit` mode, whole budget for `full`, absent for `none`. */
  depositIp?: string;
  amountPaidIp?: string;
  dataShape: Record<string, string>;
  specialInstructions: string;
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
    fundingMode: "full",
    amountPaidIp: "120",
    dataShape: {
      audio_file: "file",
      transcript: "string",
      speakers: "number",
      duration_seconds: "number",
    },
    specialInstructions:
      "Deliver one WAV per conversation plus a plain-text transcript named to match.",
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
    fundingMode: "deposit",
    depositIp: "8",
    amountPaidIp: "8",
    dataShape: {
      scan: "file",
      script: "string",
      writing_instrument: "string",
    },
    specialInstructions:
      "600dpi TIFF, one page per file. Redact any names before uploading.",
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
    fundingMode: "none",
    dataShape: {
      photo: "file",
      language: "string",
      sign_type: "string",
      city: "string",
    },
    specialInstructions:
      "Group photos by city in the manifest labels; no GPS in EXIF.",
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
    fundingMode: "deposit",
    depositIp: "6",
    amountPaidIp: "6",
    dataShape: {
      audio_file: "file",
      dialect: "string",
      speech_type: "string",
    },
    specialInstructions:
      "Slate each recording with the dialect. Spontaneous speech preferred over read.",
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
    fundingMode: "full",
    amountPaidIp: "200",
    dataShape: {
      stem: "file",
      instrument: "string",
      bpm: "number",
      key: "string",
    },
    specialInstructions:
      "Stems only — no bounced mixes. Name files instrument_take.wav.",
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
    fundingMode: "none",
    dataShape: {
      image: "file",
      lighting_setup: "string",
      subject: "string",
    },
    specialInstructions:
      "Include a lighting diagram in the notes label for each set.",
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
    fundingMode: "deposit",
    depositIp: "11",
    amountPaidIp: "11",
    dataShape: {
      clip: "file",
      product_category: "string",
      resolution: "string",
    },
    specialInstructions:
      "One product per clip, 15–60 seconds, no on-screen branding.",
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
    fundingMode: "full",
    amountPaidIp: "130",
    dataShape: {
      clip: "file",
      movement_style: "string",
      fps: "number",
    },
    specialInstructions:
      "9:16 only. Consent references belong in the labels, never in frame.",
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
    fundingMode: "none",
    dataShape: {
      audio_file: "file",
      location_type: "string",
      sample_rate: "number",
    },
    specialInstructions:
      "Two minutes minimum per bed, no edits, no fades.",
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
    fundingMode: "deposit",
    depositIp: "16",
    amountPaidIp: "16",
    dataShape: {
      mesh: "file",
      object_class: "string",
      polycount: "number",
      watertight: "boolean",
    },
    specialInstructions:
      "GLB or OBJ with textures packed; note the capture method in the labels.",
  },
];

async function main(): Promise<void> {
  // The seeded labs post briefs, so they must clear the verified-lab gate.
  for (const lab of new Set(BRIEFS.map((brief) => brief.lab))) {
    await db.query(
      `INSERT INTO creator (anon_id, display_name, avatar_seed, lab_verified)
       VALUES ($1, $1, $1, TRUE)
       ON CONFLICT (anon_id) DO UPDATE SET lab_verified = TRUE
       RETURNING id`,
      [lab],
    );
  }

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
         (requester_anon_id, requester_creator_id, title, spec, license_preset,
          budget_wei, unit_price_wei, kyc_required, deadline,
          funding_mode, deposit_wei, amount_paid_wei, data_shape, special_instructions)
       SELECT $1, (SELECT id FROM creator WHERE anon_id = $1), $2, $3::jsonb, $4, $5,
              $6, $7, $8, $9, $10, $11, $12::jsonb, $13`,
      [
        brief.lab,
        brief.title,
        JSON.stringify({ modality: brief.modality, notes: brief.notes }),
        brief.preset,
        toWei(brief.budgetIp).toString(),
        brief.unitPriceIp === null ? null : toWei(brief.unitPriceIp).toString(),
        brief.kycRequired,
        deadline,
        brief.fundingMode,
        brief.depositIp === undefined ? null : toWei(brief.depositIp).toString(),
        toWei(brief.amountPaidIp ?? "0").toString(),
        JSON.stringify(brief.dataShape),
        brief.specialInstructions,
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
