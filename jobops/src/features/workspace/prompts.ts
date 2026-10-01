export function searchPrompt(role: string, location: string, context: string) {
  return `Help me find 5 current job openings in India that fit ${role.trim() || "my developer background and career preferences from our conversation"}.

Location: ${location.trim() || "India"}. Include remote roles only when candidates based in India can apply. Use LinkedIn India, Naukri, Instahyre, Cutshort, Hirist and official company careers pages for Indian openings.

Use the skills, experience and preferences you already know about me from this conversation. Do not guess missing qualifications. Ask me one short question if a missing detail materially affects the search.
${context.trim() ? `\nMy saved context:\n${context.trim()}\n` : ""}
For each verified opening, give me:
• Company, exact role, location and work mode.
• Direct job link, source site, date checked and posting date if available.
• Full job description, requirements and skills. Clearly mark anything you could not access.
• Experience range, notice-period requirements and salary in INR/LPA when stated.
• Why it fits my actual background, important gaps, and one useful next step.
• Whether direct application or a referral looks appropriate, with evidence rather than an invented contact.

Verify that each listing is still open. Exclude duplicates, overseas-only roles, and QA, testing, SDET or test-automation roles. If you cannot browse, say so and ask me for links or job descriptions; do not invent openings.

Show the shortlist here so I can choose a role and copy its job description into my tracker. Do not apply or send messages yet.`;
}

export function resumePrompt(
  company: string,
  role: string,
  description: string,
  context: string,
  resumeLabel?: string,
) {
  return `Help me review the resume file I attach for ${role.trim() || "the role I choose"}${company.trim() ? ` at ${company.trim()}` : ""}, based in India.

${resumeLabel ? `Resume file I will attach: ${resumeLabel}.\n` : ""}Use my actual resume and what you already know about my work. Ask me about missing evidence; never invent skills, employment, achievements or numbers.
${context.trim() ? `\nMy preferences:\n${context.trim()}\n` : ""}
Job description:
${description.trim() || "I will paste the full job description here before you start. Ask for it if it is missing."}

First identify relevant strengths, missing keywords that my experience supports, and formatting or parsing issues. Walk through proposed changes with me, one section at a time.

For every changed bullet, show the original text, suggested text, reason and any fact I need to confirm. Keep a concise bullet-by-bullet change log. Preserve my original file and create a separately named version only after we agree on the edits.

Provide a clearly labelled ATS-readiness estimate for this exact resume version and job description: assessment source, date, scoring method/scale, keyword coverage, formatting issues and missing evidence. An estimate is not an employer ATS result; do not claim a score if you cannot assess it.

Return the final file, change log and assessment so I can upload them to my tracker with the company and role. Do not submit an application.`;
}

export function applicationPrompt(
  company: string,
  role: string,
  description: string,
  url: string,
  context: string,
) {
  return `Help me apply for ${role} at ${company}, for an India-based opening.\n\nOriginal listing: ${url}\n\nJob description:\n${description || "Ask me for the full description before starting."}\n${context ? `\nMy preferences:\n${context}\n` : ""}\nUse my real resume and confirmed background from this conversation. Ask me to select and attach the final resume file. Check that the role is still open and that India-based candidates are eligible. Walk through application questions with me; ask about missing facts instead of inventing answers.\n\nIf computer use is available, fill the application with the details we agree on. Show me the completed form and the exact attached file, then ask me before clicking the final submit button. If you cannot access the site, give me a step-by-step checklist for applying manually.\n\nAfter an actual submission, return the confirmation, application link, date, company, role and exact resume filename so I can record it in JobOps. Do not claim it was submitted without confirmation.`;
}

export function outreachPrompt(
  company: string,
  role: string,
  description: string,
  url: string,
  method: string,
  context: string,
) {
  const request =
    method === "REFERRAL"
      ? "ask for a referral"
      : method === "COLD_EMAIL"
        ? "write a cold email"
        : "write a LinkedIn message";
  return `Help me ${request} for ${role} at ${company}, an India-based opening.\n\nJob link: ${url}\n\nJob description:\n${description || "Ask me for the full description."}\n${context ? `\nMy preferences:\n${context}\n` : ""}\nUse what you already know about my actual work. Help me choose a relevant person using their verified public profile or the contact I provide. Do not invent email addresses, personal details or a relationship.\n\nDraft a concise, specific message: why I am interested, the relevant evidence from my background and one clear request. For a referral, include the job link and ask whether they are comfortable referring me. Keep it personal and respectful. Suggest which resume or portfolio evidence to share and work through wording with me.\n\nShow me the final recipient and message. Ask me before sending through computer use; otherwise give me the text to send myself. After sending, return the channel, recipient, date, exact resume filename if attached, and follow-up suggestion so I can record the outreach. Do not claim that messaging someone is a submitted job application.`;
}

export function jobPreferencesContext(value: Record<string, unknown>) {
  const list = (key: string) =>
    Array.isArray(value[key])
      ? value[key]
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .join(", ")
      : "";
  const remote =
    typeof value.remotePreference === "string" && value.remotePreference !== "UNKNOWN"
      ? value.remotePreference.toLowerCase().replaceAll("_", " ")
      : "";
  const hasRange =
    typeof value.minExperience === "number" &&
    typeof value.maxExperience === "number" &&
    value.maxExperience > 0;
  return [
    list("desiredRoles") && `Target roles: ${list("desiredRoles")}`,
    list("locations") && `Preferred India locations: ${list("locations")}`,
    remote && `Work mode: ${remote}`,
    hasRange && `Target role experience range: ${value.minExperience}–${value.maxExperience} years`,
    list("preferredTechnologies") && `Preferred technologies: ${list("preferredTechnologies")}`,
    list("excludedRoles") && `Exclude roles: ${list("excludedRoles")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
