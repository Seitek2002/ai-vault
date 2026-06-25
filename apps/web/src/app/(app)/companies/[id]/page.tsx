import { CompanyDetailClient } from "@/components/companies/CompanyDetailClient";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompanyDetailClient companyId={id} />;
}
