CREATE TABLE "_ContractExtras" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_ContractExtras_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_ContractExtras_B_index" ON "_ContractExtras"("B");
ALTER TABLE "_ContractExtras" ADD CONSTRAINT "_ContractExtras_A_fkey" FOREIGN KEY ("A") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ContractExtras" ADD CONSTRAINT "_ContractExtras_B_fkey" FOREIGN KEY ("B") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
