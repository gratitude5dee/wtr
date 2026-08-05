"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getActingCreator } from "@/lib/dashboard/queries";
import { createDataset, DatasetError, getDataset, takeSnapshot } from "@/lib/datasets/service";

export interface DatasetFormState {
  error: string | null;
  message: string | null;
}

export async function createDatasetAction(
  _prev: DatasetFormState,
  formData: FormData,
): Promise<DatasetFormState> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no signed-in account", message: null };

  let datasetId: string;
  try {
    datasetId = await createDataset(
      { id: creator.id },
      {
        name: String(formData.get("name") ?? ""),
        filters: {
          modality: String(formData.get("modality") ?? "").trim() || undefined,
          licensePreset: String(formData.get("preset") ?? "").trim() || undefined,
          search: String(formData.get("q") ?? "").trim() || undefined,
          kycOnly: formData.get("kyc") === "on",
          trainingOnly: true,
        },
      },
    );
  } catch (error) {
    if (error instanceof DatasetError) return { error: error.message, message: null };
    throw error;
  }
  revalidatePath("/datasets");
  redirect(`/datasets/${datasetId}`);
}

export async function takeSnapshotAction(
  _prev: DatasetFormState,
  formData: FormData,
): Promise<DatasetFormState> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no signed-in account", message: null };
  const datasetId = String(formData.get("datasetId") ?? "");

  try {
    const dataset = await getDataset(datasetId);
    if (!dataset || dataset.ownerCreatorId !== creator.id) {
      return { error: "that dataset is not yours", message: null };
    }
    const snapshot = await takeSnapshot(datasetId);
    revalidatePath(`/datasets/${datasetId}`);
    return { error: null, message: `Snapshot taken — ${snapshot.itemCount} asset(s) frozen.` };
  } catch (error) {
    if (error instanceof DatasetError) return { error: error.message, message: null };
    throw error;
  }
}
