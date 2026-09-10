import { MonthBoardClient } from "@/components/settlements/MonthBoardClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Этот месяц — Vault" };

export default function MonthPage() {
  return <MonthBoardClient />;
}
