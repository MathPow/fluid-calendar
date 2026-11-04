"use client";

import React from "react";

import { useT } from "@/i18n";

interface AccessDeniedMessageProps {
  message?: string;
  title?: string;
}

export default function AccessDeniedMessage({
  message,
  title,
}: AccessDeniedMessageProps) {
  const t = useT();
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold text-negative-foreground">
        {title ?? t("auth.accessDenied.title")}
      </h2>
      <p className="mt-2">{message ?? t("auth.accessDenied.message")}</p>
    </div>
  );
}
