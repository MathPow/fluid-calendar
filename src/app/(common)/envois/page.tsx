import { Suspense } from "react";

import { EnvoisBoard } from "@/components/envois/EnvoisBoard";

export const dynamic = "force-dynamic";

export default function EnvoisPage() {
  return (
    <Suspense>
      <EnvoisBoard />
    </Suspense>
  );
}
