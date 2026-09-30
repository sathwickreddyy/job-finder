export const taskKinds = [
  "FIND",
  "TAILOR",
  "PROFILE",
  "APPLY",
  "OUTREACH",
  "SHOWCASE",
  "CUSTOM",
] as const;
export const assistants = ["ChatGPT", "Claude", "Codex", "Claude Code", "Myself"] as const;
export const taskStarters = [
  {
    kind: "FIND",
    title: "Find openings",
    description: "Bring back roles worth your attention.",
    goal: "Find suitable openings in India using my preferences. Discuss the search with me if you need more context. Return the job descriptions and source links for review.",
  },
  {
    kind: "TAILOR",
    title: "Tailor my resume",
    description: "Work through a job description together.",
    goal: "Help me tailor my resume to the job description. Work with me interactively, keep every claim accurate, and return a proposed PDF with a clear change summary.",
  },
  {
    kind: "PROFILE",
    title: "Improve my profiles",
    description: "Strengthen LinkedIn, GitHub, and job portals.",
    goal: "Review my selected profile with me. Suggest clear, accurate improvements and prepare the changes for my approval before publishing.",
  },
  {
    kind: "APPLY",
    title: "Prepare an application",
    description: "Get ready for a role you have chosen.",
    goal: "Prepare my application using my approved resume and confirmed details. Ask me about unknown answers. Return the exact application summary for my approval before submitting.",
  },
  {
    kind: "OUTREACH",
    title: "Ask for a referral",
    description: "Or draft a cold email or LinkedIn message.",
    goal: "Help me decide whether a referral, cold email or LinkedIn message makes sense for this opportunity. Prepare a specific recipient and draft for my approval before sending.",
  },
  {
    kind: "SHOWCASE",
    title: "Showcase my work",
    description: "Turn a project into a case study or portfolio update.",
    goal: "Help me choose impactful work to showcase. Review the real project with me, draft a README, case study or portfolio update, and ask for my approval before publishing.",
  },
] as const;
