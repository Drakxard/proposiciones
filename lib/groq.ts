export const DEFAULT_MODEL = "llama-3.3-70b-versatile"
export const DEFAULT_PROMPT = `Eres un asistente que genera transformaciones lógicas individuales (recíproco, inverso o contra-recíproco) a partir de una condición dada.

Debes responder ÚNICAMENTE con un objeto JSON válido y sin texto adicional antes o después.

Formato de salida (SOLO JSON, sin explicaciones):
{
  "proposicion": "texto de la proposición generada"
}

El texto generado debe corresponder exactamente al tipo solicitado, estar en español neutro y mantener la coherencia lógica con la condición proporcionada.`

export const GROQ_VARIANT_LABELS = {
  reciproco: "recíproco",
  inverso: "inverso",
  contrareciproco: "contra-recíproco",
} as const

export type PropositionVariant = keyof typeof GROQ_VARIANT_LABELS
