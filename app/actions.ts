"use server"

import {
  GROQ_DEFAULT_MODEL,
  GROQ_DEFAULT_VARIANT_PROMPTS,
  GROQ_SYSTEM_PROMPT,
  GROQ_VARIANT_LABELS,
  type PropositionVariant,
} from "@/lib/groq"

export type { PropositionVariant } from "@/lib/groq"

const DEFAULT_REWRITE_PROMPT = `Eres un asistente que reescribe proposiciones lógicas. Recibirás una instrucción en español que siempre incluye una condición base y el tipo de proposición deseado.

Responde ÚNICAMENTE con un objeto JSON válido y sin texto adicional antes o después, usando el formato:
{
  "proposicion": "texto de la proposición reescrita"
}

El texto de la proposición debe ser claro, gramaticalmente correcto y mantener coherencia lógica con la instrucción recibida.`

const CONDITION_PLACEHOLDER_REGEX = /\{\{\s*condicion\s*\}\}/i
const TYPE_PLACEHOLDER_REGEX = /\{\{\s*tipo\s*\}\}/i

const formatVariantPrompt = (
  condition: string,
  variant: PropositionVariant,
  promptOverride?: string,
) => {
  const baseTemplate = (promptOverride ?? GROQ_DEFAULT_VARIANT_PROMPTS[variant]).trim()
  const variantLabel = GROQ_VARIANT_LABELS[variant]

  const replacements: Record<string, string> = {
    condicion: condition,
    tipo: variantLabel,
  }

  let prompt = baseTemplate.replace(/\{\{\s*(condicion|tipo)\s*\}\}/gi, (_, key: string) => {
    const normalized = key.trim().toLowerCase()
    return replacements[normalized] ?? ""
  })

  const additions: string[] = []

  if (!CONDITION_PLACEHOLDER_REGEX.test(baseTemplate)) {
    additions.push(`Condición base: ${condition}`)
  }

  if (!TYPE_PLACEHOLDER_REGEX.test(baseTemplate)) {
    additions.push(`Tipo solicitado: ${variantLabel}.`)
  }

  if (additions.length > 0) {
    const trimmed = prompt.trim()
    prompt = trimmed ? `${trimmed}\n\n${additions.join("\n")}` : additions.join("\n")
  }

  return prompt
}

type GroqTextPart = { text: string }

const isGroqTextPart = (value: unknown): value is GroqTextPart => {
  return Boolean(value && typeof value === "object" && "text" in value && typeof (value as any).text === "string")
}

const extractGroqContent = (content: unknown): string | null => {
  if (typeof content === "string") {
    return content
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (!part) return ""
        if (typeof part === "string") return part
        if (isGroqTextPart(part)) return part.text
        return ""
      })
      .filter(Boolean)

    return parts.length > 0 ? parts.join("") : null
  }

  if (isGroqTextPart(content)) {
    return content.text
  }

  return null
}

export async function generatePropositionVariant(
  condition: string,
  variant: PropositionVariant,
  model?: string,
  promptOverride?: string,
): Promise<{ text: string } | { error: string }> {
  try {
    if (!condition || typeof condition !== "string") {
      return { error: "Condición inválida" }
    }

    const variantLabel = GROQ_VARIANT_LABELS[variant]
    if (!variantLabel) {
      return { error: "Tipo de proposición no soportado" }
    }

    const apiKey = process.env.GROQ_API_KEY_CUSTOM || process.env.GROQ_API_KEY
    if (!apiKey) {
      return {
        error: "GROQ_API_KEY no está configurada. Por favor, agrega GROQ_API_KEY_CUSTOM en las variables de entorno.",
      }
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || GROQ_DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: GROQ_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: formatVariantPrompt(condition, variant, promptOverride),
          },
        ],
        temperature: 0.7,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[v0] Groq API error (variant):", errorData)
      return { error: `Error de Groq API: ${response.status} ${response.statusText}` }
    }

    const data = await response.json()
    const text = extractGroqContent(data.choices?.[0]?.message?.content)

    if (!text) {
      return { error: "Respuesta vacía de Groq" }
    }

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (parseError) {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw parseError
      }
    }

    if (!parsed.proposicion || typeof parsed.proposicion !== "string") {
      return { error: "Respuesta de Groq no tiene el formato esperado" }
    }

    return { text: parsed.proposicion }
  } catch (error) {
    console.error("[v0] Error generating proposition variant:", error)
    return {
      error: `Error al generar la proposición: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export async function rewriteProposition(
  instruction: string,
  model?: string,
  systemPrompt?: string,
): Promise<{ text: string } | { error: string }> {
  try {
    if (!instruction || typeof instruction !== "string") {
      return { error: "Instrucción inválida" }
    }

    const apiKey = process.env.GROQ_API_KEY_CUSTOM || process.env.GROQ_API_KEY
    if (!apiKey) {
      return {
        error: "GROQ_API_KEY no está configurada. Por favor, agrega GROQ_API_KEY_CUSTOM en las variables de entorno.",
      }
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || GROQ_DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt || DEFAULT_REWRITE_PROMPT,
          },
          {
            role: "user",
            content: instruction,
          },
        ],
        temperature: 0.7,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[v0] Groq API error (rewrite):", errorData)
      return { error: `Error de Groq API: ${response.status} ${response.statusText}` }
    }

    const data = await response.json()
    const text = extractGroqContent(data.choices?.[0]?.message?.content)

    if (!text) {
      return { error: "Respuesta vacía de Groq" }
    }

    let result
    try {
      result = JSON.parse(text)
    } catch (parseError) {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw parseError
      }
    }

    if (!result.proposicion || typeof result.proposicion !== "string") {
      return { error: "Respuesta de Groq no tiene el formato esperado" }
    }

    return { text: result.proposicion }
  } catch (error) {
    console.error("[v0] Error rewriting proposition:", error)
    return { error: `Error al rehacer la proposición: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function getAvailableModels(): Promise<string[]> {
  const apiKey = process.env.GROQ_API_KEY_CUSTOM || process.env.GROQ_API_KEY

  if (!apiKey) {
    return [GROQ_DEFAULT_MODEL]
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[v0] Groq API error (models):", errorData)
      return [GROQ_DEFAULT_MODEL]
    }

    const payload = await response.json()
    const models: string[] = Array.isArray(payload?.data)
      ? payload.data
          .map((entry: any) => (typeof entry?.id === "string" ? entry.id : null))
          .filter((id: string | null): id is string => Boolean(id))
      : []

    const uniqueModels = Array.from(new Set(models))

    if (!uniqueModels.includes(GROQ_DEFAULT_MODEL)) {
      uniqueModels.unshift(GROQ_DEFAULT_MODEL)
    }

    return uniqueModels
  } catch (error) {
    console.error("[v0] Error fetching Groq models:", error)
    return [GROQ_DEFAULT_MODEL]
  }
}
