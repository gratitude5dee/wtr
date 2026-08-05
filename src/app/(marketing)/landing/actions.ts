"use server";

export type ContactState = { ok: boolean; message: string };

export async function submitPartnerInquiry(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim();
  const organization = String(formData.get("organization") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  if (!name || !organization || !["lab", "distributor"].includes(type)) {
    return { ok: false, message: "Add your name, organization, and partner type." };
  }
  return { ok: true, message: "Thanks — we’ll be in touch with the next step." };
}
