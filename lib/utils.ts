import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeStringId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString()
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  return null
}

export function ensureStringId(value: unknown, fallback: string): string {
  return normalizeStringId(value) ?? fallback
}
