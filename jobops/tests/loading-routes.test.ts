import { describe, expect, it } from "vitest";
import {
  formNavigationTarget,
  isNewLocation,
  labelForPath,
  navigationTarget,
} from "@/components/loading/routes";

const here = { href: "http://127.0.0.1:3210/jobs?view=saved" };
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const anchor = (href: string, target = "", attributes: string[] = []) => ({
  href: new URL(href, here.href).href,
  target,
  hasAttribute: (name: string) => attributes.includes(name),
});

describe("navigationTarget", () => {
  it("tracks a plain click on another page of the app", () => {
    expect(navigationTarget(click, anchor("/companies"), here)?.pathname).toBe("/companies");
    expect(navigationTarget(click, anchor("/jobs?view=all"), here)?.search).toBe("?view=all");
  });
  it("ignores clicks that open elsewhere or do not change the page", () => {
    expect(navigationTarget({ ...click, metaKey: true }, anchor("/companies"), here)).toBeNull();
    expect(navigationTarget({ ...click, ctrlKey: true }, anchor("/companies"), here)).toBeNull();
    expect(navigationTarget({ ...click, shiftKey: true }, anchor("/companies"), here)).toBeNull();
    expect(navigationTarget({ ...click, altKey: true }, anchor("/companies"), here)).toBeNull();
    expect(navigationTarget({ ...click, button: 1 }, anchor("/companies"), here)).toBeNull();
    expect(navigationTarget(click, anchor("/companies", "_blank"), here)).toBeNull();
    expect(navigationTarget(click, anchor("/companies", "", ["download"]), here)).toBeNull();
    expect(navigationTarget(click, anchor("/companies", "", ["data-no-loading"]), here)).toBeNull();
    expect(navigationTarget(click, anchor("https://www.naukri.com/"), here)).toBeNull();
    expect(navigationTarget(click, anchor("mailto:me@example.invalid"), here)).toBeNull();
    expect(navigationTarget(click, anchor("/jobs?view=saved#top"), here)).toBeNull();
  });
  it("ignores file routes such as resume downloads", () => {
    expect(navigationTarget(click, anchor("/api/resumes/1/file?download=1"), here)).toBeNull();
  });
  it("accepts an explicit _self target", () => {
    expect(navigationTarget(click, anchor("/companies", "_self"), here)).not.toBeNull();
  });
});

describe("formNavigationTarget", () => {
  const form = (action: string, method = "get", target = "") => ({ action, method, target });
  it("tracks same-origin GET search forms", () => {
    expect(formNavigationTarget(form("http://127.0.0.1:3210/jobs"), here)).not.toBeNull();
  });
  it("ignores posts, new-tab forms, file routes and other sites", () => {
    expect(formNavigationTarget(form("http://127.0.0.1:3210/jobs", "post"), here)).toBeNull();
    expect(
      formNavigationTarget(form("http://127.0.0.1:3210/jobs", "get", "_blank"), here),
    ).toBeNull();
    expect(formNavigationTarget(form("http://127.0.0.1:3210/api/export"), here)).toBeNull();
    expect(formNavigationTarget(form("https://www.naukri.com/search"), here)).toBeNull();
    expect(formNavigationTarget(form("javascript:throw new Error()"), here)).toBeNull();
  });
});

describe("isNewLocation", () => {
  it("is false for the page you are already on", () => {
    expect(isNewLocation("/jobs?view=saved", here)).toBe(false);
    expect(isNewLocation("/jobs?view=saved#notes", here)).toBe(false);
  });
  it("is true for a different path or query", () => {
    expect(isNewLocation("/jobs", here)).toBe(true);
    expect(isNewLocation("/contacts/1", here)).toBe(true);
  });
});

describe("labelForPath", () => {
  it("names the destination page", () => {
    expect(labelForPath("/")).toBe("Opening Home");
    expect(labelForPath("/companies/acme")).toBe("Opening Companies");
    expect(labelForPath("/mail/123")).toBe("Opening Inbox");
    expect(labelForPath("/my-profile")).toBe("Opening My profile");
  });
  it("falls back to Loading for unknown pages", () => {
    expect(labelForPath("/something-new")).toBe("Loading");
  });
});
