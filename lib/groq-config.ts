export const GROQ_MODEL_STORAGE_KEY = "groq_model"
export const GROQ_SYSTEM_PROMPT_STORAGE_KEY = "groq_prompt"
export const GROQ_VARIANT_PROMPTS_STORAGE_KEY = "groq_variant_prompts"

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
export const DEFAULT_SYSTEM_PROMPT = `Eres un asistente que genera proposiciones lógicas. Debes responder ÚNICAMENTE con un objeto JSON válido y sin texto adicional antes o después.

Recibirás una condición base y el tipo de proposición a generar (recíproco, inverso o contra-recíproco). Debes devolver únicamente la proposición solicitada.

Formato de salida (SOLO JSON, sin explicaciones):
{
  "proposicion": "texto de la proposición solicitada"
}`

export const DEFAULT_REWRITE_PROMPT = `Eres un asistente que reescribe proposiciones lógicas. Recibirás una instrucción en español que siempre incluye una condición base y el tipo de proposición deseado.

Responde ÚNICAMENTE con un objeto JSON válido y sin texto adicional antes o después, usando el formato:
{
  "proposicion": "texto de la proposición reescrita"
}

El texto de la proposición debe ser claro, gramaticalmente correcto y mantener coherencia lógica con la instrucción recibida.`

export const VARIANT_LABELS = {
  reciproco: "recíproco",
  inverso: "inverso",
  contrareciproco: "contra-recíproco",
} as const

export type PropositionVariant = keyof typeof VARIANT_LABELS

export const DEFAULT_VARIANT_INSTRUCTIONS: Record<PropositionVariant, string> = {
  reciproco:
    'Genera el recíproco de la condición "{{condicion}}". Entrega la proposición resultante de forma clara y breve.',
  inverso:
    'Genera el inverso de la condición "{{condicion}}". Entrega la proposición resultante de forma clara y breve.',
  contrareciproco:
    'Genera el contra-recíproco de la condición "{{condicion}}". Entrega la proposición resultante de forma clara y breve.',
}
