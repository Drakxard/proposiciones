"use client"

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: Element[]) => Promise<void>
      typeset?: (elements?: Element[]) => void
      startup?: { promise?: Promise<void> }
      [key: string]: any
    }
  }
}

let mathJaxLoadingPromise: Promise<void> | null = null

async function ensureMathJax(): Promise<void> {
  if (typeof window === "undefined") return
  if (window.MathJax) {
    await window.MathJax.startup?.promise
    return
  }

  if (!mathJaxLoadingPromise) {
    window.MathJax = {
      tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]] },
      startup: { typeset: false },
    }

    mathJaxLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"
      script.async = true
      script.onload = () => {
        const startupPromise = window.MathJax?.startup?.promise
        if (startupPromise) {
          startupPromise
            .then(() => resolve())
            .catch((error: unknown) => {
              mathJaxLoadingPromise = null
              reject(error)
            })
        } else {
          resolve()
        }
      }
      script.onerror = () => {
        mathJaxLoadingPromise = null
        reject(new Error("No se pudo cargar MathJax"))
      }
      document.head.appendChild(script)
    })
  }

  await mathJaxLoadingPromise
}

interface LatexTextProps {
  text: string
  className?: string
}

export function LatexText({ text, className }: LatexTextProps) {
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = spanRef.current
    if (!element) return

    const renderText = async () => {
      const trimmed = text ?? ""

      if (!trimmed.includes("$")) {
        element.textContent = trimmed
        return
      }

      element.innerHTML = trimmed

      try {
        await ensureMathJax()
        if (element.isConnected) {
          if (window.MathJax?.typesetPromise) {
            await window.MathJax.typesetPromise([element])
          } else if (window.MathJax?.typeset) {
            window.MathJax.typeset([element])
          }
        }
      } catch (error) {
        console.error("[v0] Error rendering MathJax:", error)
        element.textContent = trimmed.replace(/\$/g, "")
      }
    }

    renderText()
  }, [text])

  return <span ref={spanRef} className={className} />
}
