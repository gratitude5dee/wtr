import { NextResponse } from "next/server";

import { activeProviderPolicy } from "@/lib/consent/policy";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await activeProviderPolicy());
}
