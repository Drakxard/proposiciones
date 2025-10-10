import { ensureStringId, normalizeStringId } from "@/lib/utils"

import type {
  StoredAppState,
  StoredEra,
  StoredSubtopic,
  StoredTheme,
  StoredProposition,
} from "@/lib/storage"

export const EXTERNAL_THEME_ID = "external-subtopics"
export const EXTERNAL_THEME_NAME = "Subtemas compartidos"
export const PENDING_SUBTOPIC_STORAGE_KEY = "propositions-app:pending-open-subtopic"

export type ExternalSubtopicPayload = {
  id: string
  name: string
}

const isExternalThemeMatch = (theme: Pick<StoredTheme, "id" | "name">) => {
  const normalizedId = normalizeStringId(theme.id)
  if (normalizedId === EXTERNAL_THEME_ID) {
    return true
  }

  const normalizedName = theme.name?.trim().toLowerCase()
  return normalizedName === EXTERNAL_THEME_NAME.toLowerCase()
}

const createExternalTheme = (subtopics: StoredSubtopic[] = []): StoredTheme => ({
  id: EXTERNAL_THEME_ID,
  name: EXTERNAL_THEME_NAME,
  subtopics,
})

const normalizeExternalThemeList = (
  themes: StoredTheme[],
): { themes: StoredTheme[]; hasExternal: boolean } => {
  let hasExternal = false

  const normalizedThemes = themes.map((theme) => {
    const subtopics = Array.isArray(theme.subtopics) ? theme.subtopics : []

    if (isExternalThemeMatch(theme)) {
      hasExternal = true
      return createExternalTheme(subtopics)
    }

    return { ...theme, subtopics }
  })

  return { themes: normalizedThemes, hasExternal }
}

const ensureExternalTheme = (themes: StoredTheme[]): StoredTheme[] => {
  const { themes: normalizedThemes, hasExternal } = normalizeExternalThemeList(themes)

  if (!hasExternal) {
    normalizedThemes.push(createExternalTheme())
  }

  return normalizedThemes
}

export const parseExternalSubtopicPayload = (
  raw: string,
): ExternalSubtopicPayload | null => {
  const decoded = decodeURIComponent(raw)

  if (!decoded) {
    return null
  }

  const [idPart, ...nameParts] = decoded.split("=")

  if (!idPart || nameParts.length === 0) {
    return null
  }

  const id = idPart.trim()
  const nameRaw = nameParts.join("=").trim()

  if (!id || !nameRaw) {
    return null
  }

  const sanitizedName = nameRaw
    .replace(/^"/, "")
    .replace(/"$/, "")
    .replace(/^'/, "")
    .replace(/'$/, "")
    .trim()

  if (!sanitizedName) {
    return null
  }

  return { id, name: sanitizedName }
}

const cloneStoredProposition = (
  proposition: StoredProposition,
  subtopicId: string,
  index: number,
): StoredProposition => ({
  ...proposition,
  id: ensureStringId(proposition.id, `${subtopicId}-${index}`),
  audios: [...proposition.audios],
})

const cloneStoredSubtopic = (
  subtopic: StoredSubtopic,
  themeId: string,
  index: number,
): StoredSubtopic => {
  const subtopicId = ensureStringId(subtopic.id, `${themeId}-subtopic-${index}`)

  return {
    ...subtopic,
    id: subtopicId,
    propositions: subtopic.propositions
      ? subtopic.propositions.map((proposition, propIndex) =>
          cloneStoredProposition(proposition, subtopicId, propIndex),
        )
      : null,
  }
}

const cloneStoredTheme = (theme: StoredTheme, eraId: string, index: number): StoredTheme => {
  const themeId = ensureStringId(theme.id, `${eraId}-theme-${index}`)

  return {
    ...theme,
    id: themeId,
    subtopics: (theme.subtopics ?? []).map((subtopic, subIndex) =>
      cloneStoredSubtopic(subtopic, themeId, subIndex),
    ),
  }
}

const cloneStoredEra = (era: StoredEra): StoredEra => {
  const eraId = ensureStringId(era.id, `era-${Date.now().toString(36)}`)

  return {
    ...era,
    id: eraId,
    themes: ensureExternalTheme(
      (era.themes ?? []).map((theme, themeIndex) => cloneStoredTheme(theme, eraId, themeIndex)),
    ),
  }
}

export const createDefaultAppState = (): StoredAppState => {
  const timestamp = Date.now()

  return {
    currentEra: {
      id: `era-auto-${timestamp}`,
      name: "Ciclo automático",
      createdAt: timestamp,
      updatedAt: timestamp,
      closedAt: null,
      themes: ensureExternalTheme([]),
    },
    eraHistory: [],
  }
}

export const prepareStateForExternalSubtopic = (
  baseState: StoredAppState | null | undefined,
): StoredAppState => {
  if (!baseState) {
    return createDefaultAppState()
  }

  return {
    currentEra: cloneStoredEra(baseState.currentEra),
    eraHistory: baseState.eraHistory.map(cloneStoredEra),
  }
}

export const upsertExternalSubtopic = (
  state: StoredAppState,
  payload: ExternalSubtopicPayload,
): StoredAppState => {
  const timestamp = Date.now()
  const { name } = payload
  const payloadId = ensureStringId(payload.id, payload.id)

  const { themes: currentThemes } = normalizeExternalThemeList(
    state.currentEra.themes ?? [],
  )
  let existingThemeIndex = currentThemes.findIndex(
    (theme) => normalizeStringId(theme.id) === EXTERNAL_THEME_ID,
  )

  let updatedThemes: StoredTheme[]

  if (existingThemeIndex === -1) {
    const newTheme = createExternalTheme([{ id: payloadId, text: name, propositions: null }])

    updatedThemes = [...currentThemes, newTheme]
  } else {
    updatedThemes = currentThemes.map((theme, index) => {
      if (index !== existingThemeIndex) {
        return theme
      }

      const subtopics = (theme.subtopics ?? []).map((subtopic, subIndex) => {
        const normalizedSubtopicId = ensureStringId(
          subtopic.id,
          `${EXTERNAL_THEME_ID}-subtopic-${subIndex}`,
        )

        return {
          ...subtopic,
          id: normalizedSubtopicId,
          propositions: subtopic.propositions
            ? subtopic.propositions.map((proposition, propIndex) => ({
                ...proposition,
                id: ensureStringId(proposition.id, `${normalizedSubtopicId}-${propIndex}`),
                audios: [...proposition.audios],
              }))
            : null,
        }
      })
      const existingSubtopicIndex = subtopics.findIndex(
        (subtopic) => normalizeStringId(subtopic.id) === payloadId,
      )

      if (existingSubtopicIndex === -1) {
        subtopics.push({ id: payloadId, text: name, propositions: null })
      } else {
        const existing = subtopics[existingSubtopicIndex]
        subtopics[existingSubtopicIndex] = {
          ...existing,
          text: name,
          propositions: existing.propositions
            ? existing.propositions.map((proposition) => ({
                ...proposition,
                text: proposition.type === "condicion" ? name : proposition.text,
                audios: [...proposition.audios],
              }))
            : null,
        }
      }

      return {
        ...theme,
        id: EXTERNAL_THEME_ID,
        name: EXTERNAL_THEME_NAME,
        subtopics,
      }
    })
  }

  return {
    ...state,
    currentEra: {
      ...state.currentEra,
      updatedAt: timestamp,
      themes: ensureExternalTheme(updatedThemes),
    },
  }
}

export const findSubtopicInAppState = (
  state: StoredAppState | null | undefined,
  id: string,
): { subtopic: StoredSubtopic; theme: StoredTheme; era: StoredEra } | null => {
  const normalizedTargetId = normalizeStringId(id)

  if (!state || !normalizedTargetId) {
    return null
  }

  const searchInEra = (era: StoredEra) => {
    const eraId = ensureStringId(era.id, `era-${Date.now().toString(36)}`)

    for (let themeIndex = 0; themeIndex < era.themes.length; themeIndex += 1) {
      const theme = era.themes[themeIndex]
      const themeId = ensureStringId(theme.id, `${eraId}-theme-${themeIndex}`)

      for (let subIndex = 0; subIndex < theme.subtopics.length; subIndex += 1) {
        const subtopic = theme.subtopics[subIndex]
        const subtopicId = ensureStringId(subtopic.id, `${themeId}-subtopic-${subIndex}`)

        if (subtopicId === normalizedTargetId) {
          return {
            subtopic: {
              ...subtopic,
              id: subtopicId,
              propositions: subtopic.propositions
                ? subtopic.propositions.map((proposition, propIndex) => ({
                    ...proposition,
                    id: ensureStringId(proposition.id, `${subtopicId}-${propIndex}`),
                    audios: [...proposition.audios],
                  }))
                : null,
            },
            theme: {
              ...theme,
              id: themeId,
              subtopics: theme.subtopics.map((item, idx) =>
                idx === subIndex
                  ? {
                      ...subtopic,
                      id: subtopicId,
                      propositions: subtopic.propositions
                        ? subtopic.propositions.map((proposition, propIndex) => ({
                            ...proposition,
                            id: ensureStringId(proposition.id, `${subtopicId}-${propIndex}`),
                            audios: [...proposition.audios],
                          }))
                        : null,
                    }
                  : item,
              ),
            },
            era: {
              ...era,
              id: eraId,
              themes: era.themes.map((item, idx) =>
                idx === themeIndex
                  ? {
                      ...theme,
                      id: themeId,
                    }
                  : item,
              ),
            },
          }
        }
      }
    }
    return null
  }

  const currentMatch = searchInEra(state.currentEra)
  if (currentMatch) {
    return currentMatch
  }

  for (const era of state.eraHistory) {
    const match = searchInEra(era)
    if (match) {
      return match
    }
  }

  return null
}
