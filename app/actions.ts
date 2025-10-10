"use server"

import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_REWRITE_PROMPT,
  VARIANT_LABELS,
  type PropositionVariant,
} from "@/lib/groq-config"

export async function generatePropositionVariant(
  condition: string,
  variant: PropositionVariant,
  model?: string,
  systemPrompt?: string,
  variantInstruction?: string,
): Promise<{ text: string } | { error: string }> {
  try {
    if (!condition || typeof condition !== "string") {
      return { error: "Condición inválida" }
    }

    const variantLabel = VARIANT_LABELS[variant]
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
        model: model || DEFAULT_GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt || DEFAULT_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content:
              variantInstruction?.trim() ||
              `Condición base: ${condition}\nTipo solicitado: ${variantLabel}.`,
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
    const text = data.choices?.[0]?.message?.content

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
        model: model || DEFAULT_GROQ_MODEL,
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
    const text = data.choices?.[0]?.message?.content

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
    return [DEFAULT_GROQ_MODEL]
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
      return [DEFAULT_GROQ_MODEL]
    }

    const payload = await response.json()
    const models: string[] = Array.isArray(payload?.data)
      ? payload.data
          .map((entry: any) => (typeof entry?.id === "string" ? entry.id : null))
          .filter((id: string | null): id is string => Boolean(id))
      : []

    const uniqueModels = Array.from(new Set(models))

    if (!uniqueModels.includes(DEFAULT_GROQ_MODEL)) {
      uniqueModels.unshift(DEFAULT_GROQ_MODEL)
    }

    return uniqueModels
  } catch (error) {
    console.error("[v0] Error fetching Groq models:", error)
    return [DEFAULT_GROQ_MODEL]
  }
}
