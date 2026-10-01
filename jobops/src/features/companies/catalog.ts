import type { companyFacts, companyLocations } from "@/db/schema";

export type Company = {
  id: string;
  name: string;
  aliases: string[];
  cities: string[];
  focus: string;
  careersUrl: string;
  locationSource: string;
  portalNote: string;
  facts?: (typeof companyFacts.$inferSelect)[];
  locations?: (typeof companyLocations.$inferSelect)[];
};

// Official careers/location sources reviewed on 1 October 2026.
// Locations describe company presence, not a guarantee of current vacancies.
export const companies: Company[] = [
  {
    id: "google",
    name: "Google",
    aliases: ["Google India", "Google LLC"],
    cities: ["Bengaluru", "Hyderabad"],
    focus: "Search, cloud & AI",
    careersUrl: "https://www.google.com/about/careers/applications/jobs/results/?location=India",
    locationSource:
      "https://www.google.com/about/careers/applications/jobs/results/?location=India",
    portalNote: "Google Careers · Choose Bengaluru or Hyderabad in the location filter.",
  },
  {
    id: "microsoft",
    name: "Microsoft",
    aliases: ["Microsoft India", "Microsoft India Development Center"],
    cities: ["Bengaluru", "Hyderabad"],
    focus: "Cloud, developer tools & AI",
    careersUrl: "https://careers.microsoft.com/",
    locationSource: "https://www.microsoft.com/en-in/msidc",
    portalNote: "Microsoft Careers · Filter by India, then your preferred city.",
  },
  {
    id: "amazon",
    name: "Amazon",
    aliases: ["Amazon India", "Amazon Web Services", "AWS"],
    cities: ["Bengaluru", "Hyderabad"],
    focus: "Commerce, cloud & infrastructure",
    careersUrl: "https://www.amazon.jobs/en/search?country=IND&loc_query=India",
    locationSource: "https://www.amazon.jobs/en/search?country=IND&loc_query=India",
    portalNote: "Amazon Jobs · India search, including Amazon and AWS teams.",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    aliases: ["Salesforce India", "Salesforce.com"],
    cities: ["Bengaluru", "Hyderabad"],
    focus: "CRM & enterprise platforms",
    careersUrl: "https://careers.salesforce.com/en/our-locations/asia-pacific/india/",
    locationSource: "https://careers.salesforce.com/en/our-locations/asia-pacific/india/",
    portalNote: "Salesforce Careers · India page with links to open roles.",
  },
  {
    id: "servicenow",
    name: "ServiceNow",
    aliases: ["ServiceNow India", "Service Now"],
    cities: ["Bengaluru", "Hyderabad"],
    focus: "Enterprise workflows & AI",
    careersUrl: "https://careers.servicenow.com/locations/apj/india/",
    locationSource: "https://careers.servicenow.com/locations/apj/india/",
    portalNote: "ServiceNow Careers · India locations and job search.",
  },
  {
    id: "oracle",
    name: "Oracle",
    aliases: ["Oracle India"],
    cities: ["Bengaluru", "Hyderabad"],
    focus: "Databases & cloud platforms",
    careersUrl: "https://careers.oracle.com/en/sites/jobsearch/?hl=en-IN",
    locationSource: "https://www.oracle.com/a/ocom/docs/service-locations-073430.pdf",
    portalNote: "Oracle Careers · Set the location to Bengaluru or Hyderabad.",
  },
  {
    id: "atlassian",
    name: "Atlassian",
    aliases: ["Atlassian India"],
    cities: ["Bengaluru"],
    focus: "Developer tools & collaboration",
    careersUrl: "https://www.atlassian.com/company/careers/all-jobs",
    locationSource: "https://www.atlassian.com/company/careers",
    portalNote: "Atlassian Careers · Filter by India and check each role’s location.",
  },
  {
    id: "razorpay",
    name: "Razorpay",
    aliases: ["Razorpay Software", "Razorpay Software Private Limited"],
    cities: ["Bengaluru"],
    focus: "Payments & financial technology",
    careersUrl: "https://razorpay.com/careers/",
    locationSource: "https://razorpay.com/return-to-work-program/",
    portalNote: "Razorpay Careers · Open all jobs and check the role’s city.",
  },
];
