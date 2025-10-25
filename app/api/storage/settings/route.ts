import { NextResponse } from "next/server"

import {
  ensureSchema,
  readSettings,
  writeSettings,
} from "@/lib/server/database"

export const GET = async () => {
  try {
    await ensureSchema()
    const settings = await readSettings()
    return NextResponse.json({ settings: settings ?? null })
  } catch (error) {
    console.error("[storage] Error al cargar settings", error)
    return NextResponse.json(
      { error: "No se pudieron cargar las configuraciones" },
      { status: 500 },
    )
  }
}

export const PUT = async (request: Request) => {
  try {
    const body = await request.json()

    if (!body || typeof body !== "object" || !("settings" in body)) {
      return NextResponse.json(
        { error: "Solicitud inválida: falta el objeto de configuraciones" },
        { status: 400 },
      )
    }

    await writeSettings(body.settings)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[storage] Error al guardar settings", error)
    return NextResponse.json(
      { error: "No se pudieron guardar las configuraciones" },
      { status: 500 },
    )
  }
}
