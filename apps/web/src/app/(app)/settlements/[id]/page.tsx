import { SettlementDetailClient } from "@/components/settlements/SettlementDetailClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Расчёт — Vault" };

export default async function SettlementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SettlementDetailClient settlementId={id} />;
}
