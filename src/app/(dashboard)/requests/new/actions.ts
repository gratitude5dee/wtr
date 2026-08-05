"use server";

import { redirect } from "next/navigation";

import { getActingCreator } from "@/lib/dashboard/queries";
import { toWei } from "@/lib/money";
import {
  createRequest,
  FUNDING_MODES,
  RequestError,
  type DataShape,
  type FundingMode,
} from "@/lib/requests/service";

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
    const fundingRaw = String(formData.get("fundingMode") ?? "none");
    if (!(FUNDING_MODES as readonly string[]).includes(fundingRaw)) {
      return { error: "choose how the request is funded" };
    }
    const fundingMode = fundingRaw as FundingMode;
    const fundedAmountRaw = String(formData.get("fundedAmount") ?? "").trim();
    const fundedWei =
      fundingMode === "none" || fundedAmountRaw === ""
        ? 0n
        : parseIp(fundedAmountRaw, "funded amount");
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
        fundingMode,
        depositWei: fundingMode === "deposit" ? fundedWei : null,
        amountPaidWei: fundedWei,
        dataShape: parseDataShape(String(formData.get("dataShape") ?? "")),
        specialInstructions: String(formData.get("specialInstructions") ?? ""),
      },
    );
  } catch (error) {
    if (error instanceof RequestError) return { error: error.message };
    throw error;
  }
  redirect(`/requests/${requestId}`);
}

/** The shape builder posts a flat `{ field: type }` object as JSON. */
function parseDataShape(raw: string): DataShape | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new RequestError("the data shape must be a JSON object of field names to types");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new RequestError("the data shape must be a JSON object of field names to types");
  }
  const shape: DataShape = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new RequestError(`the data shape field "${key}" needs a type, e.g. string`);
    }
    shape[key] = value;
  }
  return Object.keys(shape).length > 0 ? shape : null;
}

function parseIp(raw: string, field: string): bigint {
  try {
    return toWei(raw);
  } catch {
    throw new RequestError(`enter the ${field} as an IP amount, e.g. 25 or 0.5`);
  }
}
