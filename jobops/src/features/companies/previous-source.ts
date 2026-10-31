// Shared by server code and client components; no database imports here.

/** A job the user held before, recorded with "Add previous job". Months are `YYYY-MM`. */
export type PreviousJob = {
  applicationId: string;
  companyKey: string;
  role: string;
  joinedOn: string;
  leftOn: string | null;
};

/** The `source` of previous-job jobs and applications. */
export const PREVIOUS_JOB = "PREVIOUS_JOB";
