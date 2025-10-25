import { NextResponse } from "next/server"

import {
  ensureSchema,
  readAppState,
  writeAppState,
} from "@/lib/server/database"

export const GET = async () => {
  try {
    await ensureSchema()
    const state = await readAppState()

    if (!state) {
      return NextResponse.json({ state: null }, { status: 200 })
    }

    return NextResponse.json({ state })
  } catch (error) {
    console.error("[storage] Error al cargar app_state", error)
    return NextResponse.json(
      { error: "No se pudo cargar el estado de la aplicación" },
      { status: 500 },
    )
  }
}

export const PUT = async (request: Request) => {
  try {
    const body = await request.json()

    if (!body || typeof body !== "object" || !("state" in body)) {
      return NextResponse.json(
        { error: "Solicitud inválida: falta el estado a guardar" },
        { status: 400 },
      )
    }

    await writeAppState(body.state)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[storage] Error al guardar app_state", error)
    return NextResponse.json(
      { error: "No se pudo guardar el estado de la aplicación" },
      { status: 500 },
    )
  }
}
