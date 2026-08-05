"use server";

import { redirect } from "next/navigation";

import { getActingCreator } from "@/lib/dashboard/queries";
import { toWei } from "@/lib/money";
import { createRequest, RequestError } from "@/lib/requests/service";

export interface NewRequestState {
  error: string | null;
}

export async function createRequestAction(
  _prev: NewRequestState,
  formData: FormData,
): Promise<NewRequestState> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no signed-in account" };

  let requestId: string;
  try {
    const deadlineRaw = String(formData.get("deadline") ?? "").trim();
    const unitPriceRaw = String(formData.get("unitPrice") ?? "").trim();
    requestId = await createRequest(
      { id: creator.id, anonId: creator.anonId },
      {
        title: String(formData.get("title") ?? ""),
        modality: String(formData.get("modality") ?? "any"),
        notes: String(formData.get("notes") ?? ""),
        licensePreset: String(formData.get("licensePreset") ?? ""),
        budgetWei: parseIp(String(formData.get("budget") ?? ""), "budget"),
        unitPriceWei: unitPriceRaw === "" ? null : parseIp(unitPriceRaw, "per-item price"),
        kycRequired: formData.get("kycRequired") === "on",
        deadline: deadlineRaw === "" ? null : new Date(deadlineRaw),
      },
    );
  } catch (error) {
    if (error instanceof RequestError) return { error: error.message };
    throw error;
  }
  redirect(`/requests/${requestId}`);
}

function parseIp(raw: string, field: string): bigint {
  try {
    return toWei(raw);
  } catch {
    throw new RequestError(`enter the ${field} as an IP amount, e.g. 25 or 0.5`);
  }
}
