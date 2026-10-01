import { describe, expect, it } from "vitest";
import { jobSearchSites, jobSiteAction } from "@/features/workspace/job-sites";

const site = (name: string) => jobSearchSites.find((item) => item.name === name)!;

describe("job site actions", () => {
  it("opens a LinkedIn search for the role and city in India", () => {
    expect(jobSiteAction(site("LinkedIn"), "Senior Backend Engineer", "Bengaluru")).toEqual({
      href: "https://www.linkedin.com/jobs/search/?keywords=Senior%20Backend%20Engineer&location=Bengaluru%2C%20India",
      line: "“Senior Backend Engineer” in Bengaluru",
      search: true,
    });
  });
  it("builds Naukri's slug URL", () => {
    expect(jobSiteAction(site("Naukri"), "C++ / Backend Engineer", "Navi Mumbai").href).toBe(
      "https://www.naukri.com/c-backend-engineer-jobs-in-navi-mumbai",
    );
  });
  it("searches all of India when no city is stored", () => {
    expect(jobSiteAction(site("LinkedIn"), "Platform Engineer", "")).toMatchObject({
      href: "https://www.linkedin.com/jobs/search/?keywords=Platform%20Engineer&location=India",
      line: "“Platform Engineer” in India",
    });
    expect(jobSiteAction(site("Naukri"), "Platform Engineer", "").href).toBe(
      "https://www.naukri.com/platform-engineer-jobs",
    );
  });
  it("opens home pages when there is no role or no search URL", () => {
    expect(jobSiteAction(site("Naukri"), "", "Bengaluru")).toEqual({
      href: "https://www.naukri.com/",
      line: "Open Naukri",
      search: false,
    });
    expect(jobSiteAction(site("Instahyre"), "Platform Engineer", "Pune")).toEqual({
      href: "https://www.instahyre.com/",
      line: "Open Instahyre",
      search: false,
    });
  });
});
