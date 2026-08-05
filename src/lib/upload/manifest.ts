/**
 * Bulk-upload manifest: per-file metadata an agent, manager or label supplies
 * alongside a batch of files. Either a CSV with a header row or a JSON object
 * keyed on filename; both collapse to the same `filename → entry` map.
 */
export interface ManifestEntry {
  labels?: Record<string, string>;
  license_preset?: string;
  price_ip?: string;
  modality?: string;
}

export type Manifest = Record<string, ManifestEntry>;

export const SAMPLE_MANIFEST = `filename,labels,license_preset,price_ip,modality
tape_loops_12-18.wav,"genre=ambient;bpm=72",WTR-TRAIN-NONEXCLUSIVE,18,audio
storefront_signage_pack_01.zip,"subject=signage",WTR-TRAIN-NONEXCLUSIVE,42,image
`;

export class ManifestError extends Error {}

export function parseManifest(filename: string, contents: string): Manifest {
  return filename.toLowerCase().endsWith(".json")
    ? parseJsonManifest(contents)
    : parseCsvManifest(contents);
}

function parseJsonManifest(contents: string): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new ManifestError("the manifest is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ManifestError("a JSON manifest must be an object keyed on filename");
  }
  const manifest: Manifest = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ManifestError(`the entry for "${key}" must be an object`);
    }
    manifest[key] = normalizeEntry(key, value as Record<string, unknown>);
  }
  return manifest;
}

function normalizeEntry(key: string, raw: Record<string, unknown>): ManifestEntry {
  const entry: ManifestEntry = {};
  const labels = raw.labels;
  if (labels !== undefined) {
    if (typeof labels === "string") {
      entry.labels = parseLabelPairs(labels);
    } else if (typeof labels === "object" && labels !== null && !Array.isArray(labels)) {
      entry.labels = Object.fromEntries(
        Object.entries(labels as Record<string, unknown>).map(([name, value]) => [
          name,
          String(value),
        ]),
      );
    } else {
      throw new ManifestError(`the labels for "${key}" must be an object or key=value list`);
    }
  }
  for (const field of ["license_preset", "price_ip", "modality"] as const) {
    const value = raw[field];
    if (value !== undefined && value !== null && value !== "") entry[field] = String(value);
  }
  return entry;
}

/** `genre=ambient;bpm=72` → `{ genre: "ambient", bpm: "72" }`. */
function parseLabelPairs(raw: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const pair of raw.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) throw new ManifestError(`labels must be key=value pairs, got "${trimmed}"`);
    labels[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return labels;
}

function parseCsvManifest(contents: string): Manifest {
  const rows = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (rows.length < 2) throw new ManifestError("the CSV manifest needs a header and one row");
  const header = splitCsvRow(rows[0]).map((column) => column.trim().toLowerCase());
  if (!header.includes("filename")) {
    throw new ManifestError("the CSV manifest needs a `filename` column");
  }
  const manifest: Manifest = {};
  for (const line of rows.slice(1)) {
    const cells = splitCsvRow(line);
    const record: Record<string, unknown> = {};
    header.forEach((column, index) => {
      record[column] = cells[index] ?? "";
    });
    const name = String(record.filename ?? "").trim();
    if (!name) continue;
    manifest[name] = normalizeEntry(name, record);
  }
  return manifest;
}

/** Minimal CSV field split: commas separate, double quotes group. */
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}
