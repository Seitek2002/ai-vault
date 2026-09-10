import { ContractsClient } from "@/components/contracts/ContractsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Договоры — Vault" };

export default function ContractsPage() {
  return <ContractsClient />;
}
