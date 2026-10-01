// Who the user is, taken only from their stored candidate profile.

export type Identity = {
  name: string;
  role: string;
  company: string;
  years: number | null;
  city: string;
  summary: string;
  searchRole: string;
  searchCity: string;
};

type CandidateFields = {
  fullName: string | null;
  preferredName: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  yearsOfExperience: number | null;
  currentCity: string | null;
  careerSummary: string | null;
  desiredRoles: string[];
  preferredLocations: string[];
};

export function firstSentence(text: string) {
  return text.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
}

export function identityFrom(person?: CandidateFields): Identity {
  return {
    name: person?.preferredName?.trim() || person?.fullName?.trim() || "",
    role: person?.currentRole?.trim() ?? "",
    company: person?.currentCompany?.trim() ?? "",
    years: person?.yearsOfExperience ?? null,
    city: person?.currentCity?.trim() ?? "",
    summary: firstSentence(person?.careerSummary ?? ""),
    searchRole: person?.desiredRoles[0]?.trim() || person?.currentRole?.trim() || "",
    searchCity: person?.preferredLocations[0]?.trim() || person?.currentCity?.trim() || "",
  };
}

export function headline(identity: Pick<Identity, "role" | "company">) {
  return [identity.role, identity.company].filter(Boolean).join(" at ");
}

export function experienceLabel(years: number) {
  return `${years} ${years === 1 ? "year" : "years"} experience`;
}
