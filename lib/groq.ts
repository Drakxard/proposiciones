export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"

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
  reciproco:
    "Genera la proposición recíproca en español que corresponda lógicamente a la condición base:\n\n{{condicion}}",
  inverso:
    "Genera la proposición inversa en español que corresponda lógicamente a la condición base:\n\n{{condicion}}",
  contrareciproco:
    "Genera la proposición contra-recíproca en español que corresponda lógicamente a la condición base:\n\n{{condicion}}",
}

export const GROQ_VARIANT_KEYS = Object.keys(
  GROQ_VARIANT_LABELS,
) as PropositionVariant[]
