import { redirect } from "next/navigation"

interface PropositionPageProps {
  params: {
    id: string
  }
}

const PropositionRedirectPage = ({ params }: PropositionPageProps) => {
  const rawId = params?.id ?? ""

  if (!rawId) {
    redirect("/")
  }

  const searchParams = new URLSearchParams({ subtopic: rawId })
  redirect(`/?${searchParams.toString()}`)
}

export default PropositionRedirectPage
