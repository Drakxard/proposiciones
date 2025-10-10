import type {
  StoredAppState,
  StoredEra,
  StoredSubtopic,
  StoredTheme,
  StoredProposition,
} from "@/lib/storage"

const log = (...messages: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[external-subtopics]", ...messages)
  }
}

export const EXTERNAL_THEME_ID = "external-subtopics"
export const EXTERNAL_THEME_NAME = "Subtemas compartidos"
export const PENDING_SUBTOPIC_STORAGE_KEY = "propositions-app:pending-open-subtopic"

export type ExternalSubtopicPayload = {
  id: string
  name: string
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

const cloneStoredProposition = (proposition: StoredProposition): StoredProposition => ({
  ...proposition,
  audios: [...proposition.audios],
})

const cloneStoredSubtopic = (subtopic: StoredSubtopic): StoredSubtopic => ({
  ...subtopic,
  propositions: subtopic.propositions
    ? subtopic.propositions.map(cloneStoredProposition)
    : null,
})

const cloneStoredTheme = (theme: StoredTheme): StoredTheme => ({
  ...theme,
  subtopics: (theme.subtopics ?? []).map(cloneStoredSubtopic),
})

const cloneStoredEra = (era: StoredEra): StoredEra => ({
  ...era,
  themes: (era.themes ?? []).map(cloneStoredTheme),
})

export const createDefaultAppState = (): StoredAppState => {
  const timestamp = Date.now()

  return {
    currentEra: {
      id: `era-auto-${timestamp}`,
      name: "Ciclo automático",
      createdAt: timestamp,
      updatedAt: timestamp,
      closedAt: null,
      themes: [],
    },
    eraHistory: [],
  }
}

export const prepareStateForExternalSubtopic = (
  baseState: StoredAppState | null | undefined,
): StoredAppState => {
  if (!baseState) {
    log("No stored app state found. Creating default state for external subtopic.")
    return createDefaultAppState()
  }

  const prepared = {
    currentEra: cloneStoredEra(baseState.currentEra),
    eraHistory: (baseState.eraHistory ?? []).map(cloneStoredEra),
  }

  log("Prepared stored app state for external subtopic", {
    currentEraId: prepared.currentEra.id,
    currentThemeCount: prepared.currentEra.themes.length,
    historyCount: prepared.eraHistory.length,
  })

  return prepared
}

export const upsertExternalSubtopic = (
  state: StoredAppState,
  payload: ExternalSubtopicPayload,
): StoredAppState => {
  const timestamp = Date.now()
  const { id, name } = payload

  const currentThemes = state.currentEra.themes ?? []
  let existingThemeIndex = currentThemes.findIndex((theme) => theme.id === EXTERNAL_THEME_ID)

  let updatedThemes: StoredTheme[]

  if (existingThemeIndex === -1) {
    const newTheme: StoredTheme = {
      id: EXTERNAL_THEME_ID,
      name: EXTERNAL_THEME_NAME,
      subtopics: [{ id, text: name, propositions: null }],
    }

    updatedThemes = [...currentThemes, newTheme]
  } else {
    updatedThemes = currentThemes.map((theme, index) => {
      if (index !== existingThemeIndex) {
        return theme
      }

      const subtopics = [...theme.subtopics]
      const existingSubtopicIndex = subtopics.findIndex((subtopic) => subtopic.id === id)

      if (existingSubtopicIndex === -1) {
        subtopics.push({ id, text: name, propositions: null })
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
        subtopics,
      }
    })
  }

  const nextState = {
    ...state,
    currentEra: {
      ...state.currentEra,
      updatedAt: timestamp,
      themes: updatedThemes,
    },
  }

  const externalTheme = nextState.currentEra.themes.find((theme) => theme.id === EXTERNAL_THEME_ID)
  log("Upserted external subtopic", {
    subtopicId: id,
    themeCount: nextState.currentEra.themes.length,
    hasExternalTheme: Boolean(externalTheme),
    subtopicCount: externalTheme?.subtopics.length ?? 0,
  })

  return nextState
}

export const findSubtopicInAppState = (
  state: StoredAppState | null | undefined,
  id: string,
): { subtopic: StoredSubtopic; theme: StoredTheme; era: StoredEra } | null => {
  if (!state) {
    return null
  }

  const searchInEra = (era: StoredEra) => {
    for (const theme of era.themes) {
      const match = theme.subtopics.find((subtopic) => subtopic.id === id)
      if (match) {
        return { subtopic: match, theme, era }
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
