"use client"

export interface ClipboardParseDiagnostics {
  success: boolean
  parsed: any[] | null
  normalizedText: string
  appliedFixes: string[]
  error?: string
}

interface ParseCandidate {
  text: string
  fixes: string[]
}

const normalizeBackslashes = (input: string): string => {
  let result = ""
  let index = 0

  while (index < input.length) {
    const char = input[index]

    if (char === "\\") {
      if (input[index + 1] === "\\") {
        result += "\\\\"
        index += 2
      } else {
        result += "\\\\"
        index += 1
      }
      continue
    }

    result += char
    index += 1
  }

  return result
}

const tryParseJsonArray = (text: string): any[] | null => {
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed
    }
    if (parsed && typeof parsed === "object") {
      return [parsed]
    }
  } catch {
    // ignore errors
  }
  return null
}

const tryCandidate = (candidate: ParseCandidate): ClipboardParseDiagnostics | null => {
  const directResult = tryParseJsonArray(candidate.text)
  if (directResult) {
    return {
      success: true,
      parsed: directResult,
      normalizedText: candidate.text,
      appliedFixes: candidate.fixes,
    }
  }

  const sanitized = normalizeBackslashes(candidate.text)
  if (sanitized !== candidate.text) {
    const sanitizedResult = tryParseJsonArray(sanitized)
    if (sanitizedResult) {
      return {
        success: true,
        parsed: sanitizedResult,
        normalizedText: sanitized,
        appliedFixes: [...candidate.fixes, "Se normalizaron las barras invertidas"],
      }
    }
  }

  return null
}

const buildCandidateVariations = (input: string): ParseCandidate[] => {
  const trimmed = input.trim()
  const variations = new Map<string, string[]>()

  const addCandidate = (text: string, fix?: string) => {
    const existing = variations.get(text)
    if (!existing) {
      variations.set(text, fix ? [fix] : [])
      return
    }
    if (fix && !existing.includes(fix)) {
      existing.push(fix)
    }
  }

  if (!trimmed) {
    return []
  }

  addCandidate(trimmed, trimmed !== input ? "Se eliminaron espacios extra al inicio y al final" : undefined)

  if (trimmed.startsWith("{{") && trimmed.endsWith("}}") && trimmed.length > 4) {
    addCandidate(`[${trimmed.slice(1, -1)}]`, "Se adaptó el formato de doble llave {{ }} a un arreglo JSON")
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    addCandidate(`[${trimmed}]`, "Se envolvió el objeto en una lista JSON [ ]")
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    addCandidate(trimmed)
  }

  return Array.from(variations.entries()).map(([text, fixes]) => ({
    text,
    fixes,
  }))
}

const extractJsonSegments = (text: string): string[] => {
  const segments: string[] = []
  const stack: string[] = []
  let startIndex = -1
  let inString = false
  let isEscaped = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (char === "\\" && !isEscaped) {
      isEscaped = true
      continue
    }

    if (char === '"' && !isEscaped) {
      inString = !inString
    }

    isEscaped = false

    if (inString) {
      continue
    }

    if (char === "{" || char === "[") {
      if (stack.length === 0) {
        startIndex = i
      }
      stack.push(char)
      continue
    }

    if (char === "}" || char === "]") {
      if (stack.length === 0) {
        continue
      }

      const last = stack[stack.length - 1]
      const isMatching =
        (last === "{" && char === "}") || (last === "[" && char === "]")

      if (!isMatching) {
        stack.length = 0
        startIndex = -1
        continue
      }

      stack.pop()
      if (stack.length === 0 && startIndex !== -1) {
        segments.push(text.slice(startIndex, i + 1))
        startIndex = -1
      }
    }
  }

  return segments
}

export const parseClipboardJsonWithDiagnostics = (text: string): ClipboardParseDiagnostics => {
  const trimmedInput = text.trim()

  if (!trimmedInput) {
    return {
      success: false,
      parsed: null,
      normalizedText: "",
      appliedFixes: [],
      error: "Pega primero el contenido que quieres importar.",
    }
  }

  const initialCandidates = buildCandidateVariations(trimmedInput)
  for (const candidate of initialCandidates) {
    const result = tryCandidate(candidate)
    if (result) {
      return result
    }
  }

  const segments = extractJsonSegments(text)
  for (const segment of segments) {
    const segmentCandidates = buildCandidateVariations(segment)
    for (const candidate of segmentCandidates) {
      const result = tryCandidate(candidate)
      if (result) {
        return result
      }
    }
  }

  return {
    success: false,
    parsed: null,
    normalizedText: "",
    appliedFixes: [],
    error:
      "No se pudo interpretar el contenido como JSON. Revisa las comillas y que la estructura sea un arreglo de elementos.",
  }
}
