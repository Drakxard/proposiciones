"use client"

import { useEffect, useMemo, useRef, useState } from "react"

interface MathTextProps {
  text: string
  className?: string
}

export const MathText = ({ text, className }: MathTextProps) => {
  const [isKatexReady, setIsKatexReady] = useState(
    typeof window !== "undefined" && Boolean((window as any).katex),
  )

  const segments = useMemo(() => {
    const tokens: { type: "text" | "math"; content: string; display: boolean }[] = []

    if (!text) {
      return [{ type: "text", content: "", display: false }]
    }

    const regex = /\$\$(.+?)\$\$|\$(.+?)\$/gs
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, displayMath, inlineMath] = match
      const startIndex = match.index

      if (startIndex > lastIndex) {
        tokens.push({
          type: "text",
          content: text.slice(lastIndex, startIndex),
          display: false,
        })
      }

      const mathContent = (displayMath ?? inlineMath ?? "").trim()
      tokens.push({
        type: "math",
        content: mathContent,
        display: Boolean(displayMath),
      })

      lastIndex = startIndex + fullMatch.length
    }

    if (lastIndex < text.length) {
      tokens.push({ type: "text", content: text.slice(lastIndex), display: false })
    }

    if (tokens.length === 0) {
      tokens.push({ type: "text", content: text, display: false })
    }

    return tokens
  }, [text])

  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    if (typeof window === "undefined") return
    if ((window as any).katex) {
      setIsKatexReady(true)
      return
    }

    if (!document.getElementById("katex-styles")) {
      const link = document.createElement("link")
      link.id = "katex-styles"
      link.rel = "stylesheet"
      link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
      document.head.appendChild(link)
    }

    const existingScript = document.getElementById("katex-script") as HTMLScriptElement | null
    if (existingScript) {
      const handleLoad = () => setIsKatexReady(true)
      if ((window as any).katex) {
        setIsKatexReady(true)
      } else {
        existingScript.addEventListener("load", handleLoad, { once: true })
      }
      return () => existingScript.removeEventListener("load", handleLoad)
    }

    const script = document.createElement("script")
    script.id = "katex-script"
    script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
    script.async = true
    script.onload = () => setIsKatexReady(true)
    script.onerror = () => console.error("No se pudo cargar KaTeX")
    document.head.appendChild(script)

    return () => {
      script.onload = null
    }
  }, [])

  useEffect(() => {
    if (!isKatexReady) return
    const katex = (window as any).katex
    if (!katex) return

    segments.forEach((segment, index) => {
      if (segment.type === "math") {
        const element = segmentRefs.current[index]
        if (element) {
          try {
            katex.render(segment.content, element, {
              throwOnError: false,
              displayMode: segment.display,
              strict: false,
              trust: true,
            })
          } catch (error) {
            console.error("[math-text] Error rendering KaTeX:", error)
            element.textContent = segment.content
          }
        }
      }
    })
  }, [isKatexReady, segments])

  const containerClassName = className
    ? `math-text whitespace-pre-wrap break-words ${className}`
    : "math-text whitespace-pre-wrap break-words"

  return (
    <span className={containerClassName}>
      {segments.map((segment, index) => {
        if (segment.type === "math") {
          return (
            <span
              key={index}
              ref={(el) => {
                segmentRefs.current[index] = el
              }}
              className={segment.display ? "block my-2" : "inline"}
            />
          )
        }

        return <span key={index}>{segment.content}</span>
      })}
    </span>
  )
}
