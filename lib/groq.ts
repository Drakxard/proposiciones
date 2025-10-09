export interface GroqModelOption {
  id: string
  label: string
  description?: string
}

export const UNIVERSAL_MODELS: GroqModelOption[] = [
  {
    id: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B Versatile",
    description: "Universal: máxima calidad para la generación general.",
  },
  {
    id: "llama-3.1-70b-versatile",
    label: "Llama 3.1 70B Versatile",
    description: "Universal: alternativa estable con amplio contexto.",
  },
  {
    id: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant",
    description: "Universal: opción rápida y económica.",
  },
]

export const REASONER_MODELS: GroqModelOption[] = [
  {
    id: "mixtral-8x7b-32768",
    label: "Mixtral 8x7B 32K",
    description: "Razonador: bueno para tareas complejas o de reflexión.",
  },
  {
    id: "gemma2-9b-it",
    label: "Gemma 2 9B Instruct",
    description: "Razonador: ideal para ajustes finos y respuestas detalladas.",
  },
]

export const DEFAULT_UNIVERSAL_MODEL = UNIVERSAL_MODELS[0]?.id ?? "llama-3.3-70b-versatile"
export const DEFAULT_REASONER_MODEL = REASONER_MODELS[0]?.id ?? DEFAULT_UNIVERSAL_MODEL

export const DEFAULT_PROMPT = `Según esta condición crea su recíproco, inverso, contra-recíproco.

Salida obligatoria en formato JSON:
{
  "reciproco": "texto del recíproco",
  "inverso": "texto del inverso",
  "contrareciproco": "texto del contra-recíproco"
}`

export const DEFAULT_REWRITE_PROMPT = `Eres un asistente que reescribe proposiciones lógicas. Recibirás una instrucción en español que siempre incluye una condición base y el tipo de proposición deseado.

Responde ÚNICAMENTE con un objeto JSON válido y sin texto adicional antes o después, usando el formato:
{
  "proposicion": "texto de la proposición reescrita"
}

El texto de la proposición debe ser claro, gramaticalmente correcto y mantener coherencia lógica con la instrucción recibida.`

export const GROQ_MODEL_GROUPS = {
  universal: UNIVERSAL_MODELS,
  reasoner: REASONER_MODELS,
} as const

export type GroqModelGroupKey = keyof typeof GROQ_MODEL_GROUPS
export type GroqModelGroups = Record<GroqModelGroupKey, GroqModelOption[]>
