/**
 * The finetuning playground: compose a training dataset out of listed work.
 *
 * A dataset is a *saved catalog query* — the same {@link CatalogFilters} the
 * buyer catalog uses — plus immutable snapshots of what that query resolved to.
 * Two invariants hold everywhere in this module:
 *
 *  1. `trainingOnly` is forced on before any query runs, so WTR-NO-TRAIN work
 *     can never enter a dataset, a snapshot or an export — not even through a
 *     hand-edited saved filter.
 *  2. Nothing here touches media. Datasets carry asset ids, catalog metadata
 *     and labels; plaintext originals and decryption keys stay where they are.
 */
import { listCatalog, type CatalogFilters, type CatalogItem } from "../catalog/service";
import { db, type Queryable } from "../db/pool";

/** Bad input, safe to echo to the caller. */
export class DatasetError extends Error {}

export interface DatasetRow {
  id: string;
  ownerCreatorId: string;
  name: string;
  filters: CatalogFilters;
  createdAt: Date;
  snapshotCount: number;
}

export interface DatasetSnapshotRow {
  id: string;
  datasetId: string;
  filters: CatalogFilters;
  assetIds: string[];
  itemCount: number;
  createdAt: Date;
}

/**
 * The only way filters reach SQL. Unknown keys are dropped and `trainingOnly`
 * is pinned on, which is what makes a saved filter safe to replay later.
 */
export function trainingFilters(filters: CatalogFilters): CatalogFilters {
  return {
    modality: filters.modality || undefined,
    licensePreset:
      filters.licensePreset && filters.licensePreset !== "WTR-NO-TRAIN"
        ? filters.licensePreset
        : undefined,
    search: filters.search || undefined,
    kycOnly: filters.kycOnly === true ? true : undefined,
    trainingOnly: true,
  };
}

/** Live preview of what a filter would pull in right now. */
export async function previewDataset(
  filters: CatalogFilters,
  q: Queryable = db,
): Promise<CatalogItem[]> {
  return listCatalog(trainingFilters(filters), q);
}

export async function createDataset(
  owner: { id: string },
  input: { name: string; filters: CatalogFilters },
  q: Queryable = db,
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new DatasetError("give the dataset a name");
  if (name.length > 120) throw new DatasetError("that name is too long");
  const rows = await q.query<{ id: string }>(
    `INSERT INTO dataset (owner_creator_id, name, filters)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (owner_creator_id, lower(name)) DO NOTHING
     RETURNING id`,
    [owner.id, name, JSON.stringify(trainingFilters(input.filters))],
  );
  const id = rows.rows[0]?.id;
  if (!id) throw new DatasetError("you already have a dataset with that name");
  return id;
}

interface DatasetDbRow {
  id: string;
  owner_creator_id: string;
  name: string;
  filters: CatalogFilters | null;
  created_at: Date;
  snapshot_count: string | number;
}

function toDataset(row: DatasetDbRow): DatasetRow {
  return {
    id: row.id,
    ownerCreatorId: row.owner_creator_id,
    name: row.name,
    filters: trainingFilters(row.filters ?? {}),
    createdAt: row.created_at,
    snapshotCount: Number(row.snapshot_count ?? 0),
  };
}

const DATASET_SELECT = `SELECT d.id, d.owner_creator_id, d.name, d.filters, d.created_at,
          (SELECT count(*) FROM dataset_snapshot s WHERE s.dataset_id = d.id) AS snapshot_count
   FROM dataset d`;

export async function listDatasets(ownerId: string, q: Queryable = db): Promise<DatasetRow[]> {
  const rows = await q.query<DatasetDbRow>(
    `${DATASET_SELECT} WHERE d.owner_creator_id = $1 ORDER BY d.created_at DESC`,
    [ownerId],
  );
  return rows.rows.map(toDataset);
}

export async function getDataset(id: string, q: Queryable = db): Promise<DatasetRow | null> {
  const rows = await q.query<DatasetDbRow>(`${DATASET_SELECT} WHERE d.id = $1`, [id]);
  const row = rows.rows[0];
  return row ? toDataset(row) : null;
}

function toSnapshot(row: {
  id: string;
  dataset_id: string;
  filters: CatalogFilters | null;
  asset_ids: string[] | null;
  item_count: number;
  created_at: Date;
}): DatasetSnapshotRow {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    filters: row.filters ?? {},
    assetIds: row.asset_ids ?? [],
    itemCount: Number(row.item_count),
    createdAt: row.created_at,
  };
}

/**
 * Freezes the dataset's current membership. The row is immutable at the
 * database level (`dataset_snapshot_no_update`/`_no_delete` rules), so a later
 * edit to the dataset's filters produces a *new* snapshot rather than
 * rewriting an exported one.
 */
export async function takeSnapshot(
  datasetId: string,
  q: Queryable = db,
): Promise<DatasetSnapshotRow> {
  const dataset = await getDataset(datasetId, q);
  if (!dataset) throw new DatasetError("that dataset no longer exists");
  const items = await previewDataset(dataset.filters, q);
  if (items.length === 0) {
    throw new DatasetError("no training-licensed assets match these filters yet");
  }
  const assetIds = items.map((item) => item.assetId);
  const rows = await q.query<{
    id: string;
    dataset_id: string;
    filters: CatalogFilters | null;
    asset_ids: string[] | null;
    item_count: number;
    created_at: Date;
  }>(
    `INSERT INTO dataset_snapshot (dataset_id, filters, asset_ids, item_count)
     VALUES ($1, $2::jsonb, $3::uuid[], $4)
     RETURNING id, dataset_id, filters, asset_ids, item_count, created_at`,
    [datasetId, JSON.stringify(dataset.filters), assetIds, assetIds.length],
  );
  const row = rows.rows[0];
  if (!row) throw new DatasetError("the snapshot could not be recorded");
  return toSnapshot(row);
}

export async function listSnapshots(
  datasetId: string,
  q: Queryable = db,
): Promise<DatasetSnapshotRow[]> {
  const rows = await q.query<{
    id: string;
    dataset_id: string;
    filters: CatalogFilters | null;
    asset_ids: string[] | null;
    item_count: number;
    created_at: Date;
  }>(
    `SELECT id, dataset_id, filters, asset_ids, item_count, created_at
     FROM dataset_snapshot WHERE dataset_id = $1 ORDER BY created_at DESC`,
    [datasetId],
  );
  return rows.rows.map(toSnapshot);
}

export async function getSnapshot(
  snapshotId: string,
  q: Queryable = db,
): Promise<DatasetSnapshotRow | null> {
  const rows = await q.query<{
    id: string;
    dataset_id: string;
    filters: CatalogFilters | null;
    asset_ids: string[] | null;
    item_count: number;
    created_at: Date;
  }>(
    `SELECT id, dataset_id, filters, asset_ids, item_count, created_at
     FROM dataset_snapshot WHERE id = $1`,
    [snapshotId],
  );
  const row = rows.rows[0];
  return row ? toSnapshot(row) : null;
}

/** One row of an export: catalog metadata plus the asset's public labels. */
export interface DatasetMember {
  assetId: string;
  filename: string | null;
  modality: string;
  previewUrl: string | null;
  licensePreset: string;
  creatorAnonId: string;
  contentSha256: string;
  ipId: string | null;
  labels: Record<string, string>;
}

/**
 * Resolves a snapshot's frozen membership. The `WTR-NO-TRAIN` guard is
 * repeated here rather than trusted from snapshot time: if a listing's terms
 * changed after the snapshot was taken, the export must drop that asset.
 */
export async function snapshotMembers(
  snapshot: DatasetSnapshotRow,
  q: Queryable = db,
): Promise<DatasetMember[]> {
  if (snapshot.assetIds.length === 0) return [];
  const rows = await q.query<{
    asset_id: string;
    filename: string | null;
    modality: string;
    preview_url: string | null;
    license_preset: string;
    creator_anon_id: string;
    content_sha256: string;
    ip_id: string | null;
    labels: Record<string, string> | null;
  }>(
    `SELECT a.id AS asset_id, a.filename, a.modality, a.preview_url,
            l.license_preset, c.anon_id AS creator_anon_id,
            a.content_sha256, a.ip_id,
            COALESCE(
              (SELECT jsonb_object_agg(al.key, al.value #>> '{}')
               FROM asset_label al
               WHERE al.asset_id = a.id AND al.namespace <> 'wtr'),
              '{}'::jsonb
            ) AS labels
     FROM asset a
     JOIN listing l ON l.asset_id = a.id AND l.status = 'active'
     JOIN creator c ON c.id = a.creator_id
     WHERE a.id = ANY($1::uuid[]) AND l.license_preset <> 'WTR-NO-TRAIN'
     ORDER BY a.id`,
    [snapshot.assetIds],
  );
  return rows.rows.map((row) => ({
    assetId: row.asset_id,
    filename: row.filename,
    modality: row.modality,
    previewUrl: row.preview_url,
    licensePreset: row.license_preset,
    creatorAnonId: row.creator_anon_id,
    contentSha256: row.content_sha256,
    ipId: row.ip_id,
    labels: row.labels ?? {},
  }));
}

/**
 * The preference pairs a DPO export draws on, from the `preference_pair` table
 * (migration 0009). The table may not exist yet in an environment that has not
 * run that migration, and it is routinely empty — both degrade to an empty
 * export rather than an error.
 */
export interface PreferencePairRow {
  prompt: string;
  chosen: string;
  rejected: string;
  confidence: number;
  jurors: unknown;
  assetId: string | null;
}

export async function preferencePairsForAssets(
  assetIds: readonly string[],
  q: Queryable = db,
): Promise<PreferencePairRow[]> {
  if (assetIds.length === 0) return [];
  try {
    const rows = await q.query<{
      prompt: string;
      chosen: string;
      rejected: string;
      confidence: number;
      jurors: unknown;
      asset_id: string | null;
    }>(
      `SELECT prompt, chosen, rejected, confidence, jurors, asset_id
       FROM preference_pair
       WHERE asset_id = ANY($1::uuid[])
       ORDER BY created_at`,
      [assetIds],
    );
    return rows.rows.map((row) => ({
      prompt: row.prompt,
      chosen: row.chosen,
      rejected: row.rejected,
      confidence: Number(row.confidence),
      jurors: row.jurors ?? [],
      assetId: row.asset_id,
    }));
  } catch (error) {
    // 42P01 undefined_table: migration 0009 has not landed in this database.
    if ((error as { code?: string })?.code === "42P01") return [];
    throw error;
  }
}
