export const GROQ_DEFAULT_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct"

export const GROQ_MODEL_STORAGE_KEY = "groq_model"
export const GROQ_VARIANT_PROMPTS_STORAGE_KEY = "groq_variant_prompts"
export const GROQ_LEGACY_PROMPT_STORAGE_KEY = "groq_prompt"

export const GROQ_SYSTEM_PROMPT = `Eres un asistente que genera proposiciones lógicas. Debes responder ÚNICAMENTE con un objeto JSON válido y sin texto adicional antes o después.

Formato de salida (SOLO JSON, sin explicaciones):
{
  "proposicion": "texto de la proposición solicitada"
}`

export const GROQ_VARIANT_LABELS = {
  reciproco: "recíproco",
  inverso: "inverso",
  contrareciproco: "contra-recíproco",
} as const

export type PropositionVariant = keyof typeof GROQ_VARIANT_LABELS

export const GROQ_DEFAULT_VARIANT_PROMPTS: Record<PropositionVariant, string> = {
  reciproco: `Identifica la hipotesis como tesis de la proposicion logica, cambia lo minimo la condicion base y devuelve su condicion reciproca:
{{condicion}}.`,
  inverso: `Identifica la hipotesis como tesis de la proposicion logica, cambia lo minimo la condicion base y devuelve su condicion inversa:

{{condicion}}`,
  contrareciproco: `Identifica la hipotesis como tesis de la proposicion logica, cambia lo minimo la condicion base y devuelve su condicion contra-recíproca:

{{condicion}}`,
}

export const GROQ_VARIANT_KEYS = Object.keys(
  GROQ_VARIANT_LABELS,
) as PropositionVariant[]
