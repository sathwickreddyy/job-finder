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

Verify that each listing is still open. Exclude duplicates and overseas-only roles. If you cannot browse, say so and ask me for links or job descriptions; do not invent openings.

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
