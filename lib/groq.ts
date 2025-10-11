export const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"

export const GROQ_MODEL_STORAGE_KEY = "groq_model"
export const GROQ_VARIANT_PROMPTS_STORAGE_KEY = "groq_variant_prompts"
export const GROQ_LEGACY_PROMPT_STORAGE_KEY = "groq_prompt"

type ReasoningEffort = "low" | "medium" | "high" | "default"

type GroqModelConfig = {
  temperature?: number
  topP?: number
  maxTokens?: number
  maxCompletionTokens?: number
  reasoningEffort?: ReasoningEffort
}

export const GROQ_MODEL_CONFIGS: Record<string, GroqModelConfig> = {
  "openai/gpt-oss-120b": {
    temperature: 1,
    topP: 1,
    maxCompletionTokens: 8192,
    reasoningEffort: "medium",
  },
  "qwen/qwen3-32b": {
    temperature: 0.6,
    topP: 0.95,
    maxCompletionTokens: 4096,
    reasoningEffort: "default",
  },
}

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
