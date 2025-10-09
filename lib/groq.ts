export type ModelKind = "universal" | "reasoner"

export interface ModelOption {
  id: string
  label: string
  kind: ModelKind
  description: string
}

export const UNIVERSAL_MODEL_ID = "llama-3.3-70b-versatile"

export const DEFAULT_SYSTEM_PROMPT = `Eres un asistente que genera proposiciones lógicas. Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes o después.

Dada una condición lógica, genera su recíproco, inverso y contra-recíproco.

Formato de salida (SOLO JSON, sin explicaciones):
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

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: UNIVERSAL_MODEL_ID,
    label: "LLaMA 3.3 70B (Universal)",
    kind: "universal",
    description: "Modelo universal recomendado para generar proposiciones de manera equilibrada.",
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    label: "DeepSeek R1 Distill LLaMA 70B (Razonador)",
    kind: "reasoner",
    description: "Razonador para casos complejos que requieren pasos intermedios y mayor profundidad.",
  },
  {
    id: "mixtral-8x7b-32768",
    label: "Mixtral 8x7B (Razonamiento rápido)",
    kind: "reasoner",
    description: "Opción eficiente orientada a respuestas rápidas con buena calidad lógica.",
  },
]

export const MODEL_KIND_ORDER: ModelKind[] = ["universal", "reasoner"]

export const MODEL_KIND_LABEL: Record<ModelKind, string> = {
  universal: "Modelos universales",
  reasoner: "Modelos razonadores",
}

export const isAllowedGroqModel = (modelId: string | null | undefined): modelId is string =>
  !!modelId && MODEL_OPTIONS.some((option) => option.id === modelId)

export const ensureAllowedModel = (modelId?: string | null) =>
  (modelId && isAllowedGroqModel(modelId)) ? modelId : UNIVERSAL_MODEL_ID
