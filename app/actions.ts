"use server"

const DEFAULT_MODEL = "llama-3.3-70b-versatile"
const DEFAULT_PROMPT = `Eres un asistente que genera proposiciones lógicas. Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes o después.

Dada una condición lógica, genera su recíproco, inverso y contra-recíproco.

Formato de salida (SOLO JSON, sin explicaciones):
{
  "reciproco": "texto del recíproco",
  "inverso": "texto del inverso",
  "contrareciproco": "texto del contra-recíproco"
}`

export async function generatePropositions(
  condition: string,
  model?: string,
  systemPrompt?: string,
): Promise<{ reciproco: string; inverso: string; contrareciproco: string } | { error: string }> {
  try {
    console.log("[v0] Generating propositions for:", condition)

    if (!condition || typeof condition !== "string") {
      return { error: "Condición inválida" }
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
            content: condition,
          },
        ],
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[v0] Groq API error:", errorData)
      return { error: `Error de Groq API: ${response.status} ${response.statusText}` }
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content

    if (!text) {
      return { error: "Respuesta vacía de Groq" }
    }

    console.log("[v0] Groq response:", text)

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

    if (!result.reciproco || !result.inverso || !result.contrareciproco) {
      return { error: "Respuesta de Groq no tiene el formato esperado" }
    }

    return {
      reciproco: result.reciproco,
      inverso: result.inverso,
      contrareciproco: result.contrareciproco,
    }
  } catch (error) {
    console.error("[v0] Error generating propositions:", error)
    return { error: `Error al generar proposiciones: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function getAvailableModels(): Promise<string[]> {
  return [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ]
}
