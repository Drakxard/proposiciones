export const SUBTOPIC_COPY_TEMPLATE_STORAGE_KEY = "subtopic-copy-template"

export const DEFAULT_SUBTOPIC_COPY_TEMPLATE =
  "La condición inicial es {condicion} El recíproco de la condición es {reciproco} El inverso de la proposición es {inverso} La proposición contra-recíproca es {contrareciproco}."

export type CopyTemplatePlaceholders = {
  condicion: string
  reciproco: string
  inverso: string
  contrareciproco: string
  subtema?: string
  tema?: string
}

export const getStoredSubtopicCopyTemplate = (): string => {
  if (typeof window === "undefined") {
    return DEFAULT_SUBTOPIC_COPY_TEMPLATE
  }

  try {
    const stored = window.localStorage.getItem(SUBTOPIC_COPY_TEMPLATE_STORAGE_KEY)
    if (stored && typeof stored === "string") {
      return stored
    }
  } catch (error) {
    console.warn("[copy-template] No se pudo leer el formato de copiado desde localStorage:", error)
  }

  return DEFAULT_SUBTOPIC_COPY_TEMPLATE
}

export const buildSubtopicCopyText = (
  template: string,
  values: CopyTemplatePlaceholders,
): string => {
  const replacements: Record<string, string> = {
    condicion: values.condicion ?? "",
    reciproco: values.reciproco ?? "",
    inverso: values.inverso ?? "",
    contrareciproco: values.contrareciproco ?? "",
    subtema: values.subtema ?? "",
    tema: values.tema ?? "",
  }

  let output = template

  Object.entries(replacements).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, "gi")
    output = output.replace(regex, value ?? "")
  })

  return output
}
