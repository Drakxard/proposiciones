import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

import { cn } from "@/lib/utils"

interface MathTextProps {
  text: string
  className?: string
}

export function MathText({ text, className }: MathTextProps) {
  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <span className="block">{children}</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
