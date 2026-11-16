"use client";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";

const SHELL_FREE = ["/", "/get-started"];

export function ShellSwitch({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (SHELL_FREE.includes(path)) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
