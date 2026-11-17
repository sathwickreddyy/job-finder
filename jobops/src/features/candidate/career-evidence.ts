// Shared instructions for assistants consuming a selected file or saved profile context.
export const CAREER_EVIDENCE_RULES = [
  "Use the current DOCX master and latest confirmed corrections as the complete evidence source. An older tailored résumé is a role-specific selection, not a complete profile. If the source is unavailable, ask for it rather than assuming omitted experience is absent.",
  "Consider confirmed professional experience and project experience, including AI-assisted work. Keep their provenance separate: project work can demonstrate skills but does not establish professional tenure, employer attribution or production scale. Respect the user's résumé presentation preferences; considering project evidence does not require adding a Projects section.",
  "Match the opening's actual responsibilities, seniority and explicit experience requirements against the complete confirmed background. Repeated backend, cloud, platform or data wording does not establish a specialist identity. Re-weight relevant evidence for each role without excluding otherwise suitable software engineering or full-stack roles by title alone, inventing expertise, or treating total experience as years in every skill.",
];

export const careerEvidenceGuidance = CAREER_EVIDENCE_RULES.join("\n");
