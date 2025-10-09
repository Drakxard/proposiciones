"use server"

const DEFAULT_MODEL = "llama-3.3-70b-versatile"
const DEFAULT_PROMPT = `Eres un asistente que genera proposiciones lógicas. Debes responder ÚNICAMENTE con un objeto JSON válido y sin texto adicional antes o después.

Recibirás una condición base y el tipo de proposición a generar (recíproco, inverso o contra-recíproco). Debes devolver únicamente la proposición solicitada.

Formato de salida (SOLO JSON, sin explicaciones):
{
  "proposicion": "texto de la proposición solicitada"
}`

const DEFAULT_REWRITE_PROMPT = `Eres un asistente que reescribe proposiciones lógicas. Recibirás una instrucción en español que siempre incluye una condición base y el tipo de proposición deseado.

Responde ÚNICAMENTE con un objeto JSON válido y sin texto adicional antes o después, usando el formato:
{
  "proposicion": "texto de la proposición reescrita"
}

El texto de la proposición debe ser claro, gramaticalmente correcto y mantener coherencia lógica con la instrucción recibida.`

const VARIANT_LABELS = {
  reciproco: "recíproco",
  inverso: "inverso",
  contrareciproco: "contra-recíproco",
} as const

export type PropositionVariant = keyof typeof VARIANT_LABELS

export async function generatePropositionVariant(
  condition: string,
  variant: PropositionVariant,
  model?: string,
  systemPrompt?: string,
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
        model: model || DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt || DEFAULT_PROMPT,
          },
          {
            role: "user",
            content: `Condición base: ${condition}\nTipo solicitado: ${variantLabel}.`,
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
        model: model || DEFAULT_MODEL,
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
    return [DEFAULT_MODEL]
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
      return [DEFAULT_MODEL]
    }

    const payload = await response.json()
    const models: string[] = Array.isArray(payload?.data)
      ? payload.data
          .map((entry: any) => (typeof entry?.id === "string" ? entry.id : null))
          .filter((id: string | null): id is string => Boolean(id))
      : []

    const uniqueModels = Array.from(new Set(models))

    if (!uniqueModels.includes(DEFAULT_MODEL)) {
      uniqueModels.unshift(DEFAULT_MODEL)
    }

    return uniqueModels
  } catch (error) {
    console.error("[v0] Error fetching Groq models:", error)
    return [DEFAULT_MODEL]
  }
}
