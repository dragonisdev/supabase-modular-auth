"use client";

import { useEffect } from "react";
import { initCsrf } from "@/lib/api";

export function CsrfProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initCsrf();
  }, []);

  return <>{children}</>;
}
