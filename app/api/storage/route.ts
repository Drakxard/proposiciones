import { NextResponse } from "next/server"

import { clearStorage } from "@/lib/server/database"

export const DELETE = async () => {
  try {
    await clearStorage()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[storage] Error al limpiar datos", error)
    return NextResponse.json(
      { error: "No se pudieron eliminar los datos almacenados" },
      { status: 500 },
    )
  }
}
