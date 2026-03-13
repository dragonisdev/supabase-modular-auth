"use client";

import React, { useEffect, type ReactNode } from "react";

import { initCsrf } from "@/lib/api";

export function CsrfProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initCsrf();
  }, []);

  return <>{children}</>;
}
