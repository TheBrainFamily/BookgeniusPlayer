import { Suspense } from "react";
import { AdminPageClient } from "./AdminPageClient";

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageClient />
    </Suspense>
  );
}
