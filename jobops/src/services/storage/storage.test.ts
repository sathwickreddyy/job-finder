import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  contentDisposition,
  MAX_UPLOAD_BYTES,
  putBuffer,
  readBuffer,
  removeFile,
  resolveStoragePath,
  safeFilename,
} from "./index";

let temporary: string;
beforeEach(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), "jobops-storage-"));
  vi.stubEnv("STORAGE_ROOT", path.join(temporary, "private"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(temporary, { recursive: true, force: true });
});

describe("private storage boundary", () => {
  it("stores opaque references and supports verified reads and cleanup", async () => {
    const input = Buffer.from("%PDF-fictional-unit-test");
    const stored = await putBuffer(input, { namespace: "resumes", extension: "pdf" });
    expect(stored.storagePath).toMatch(/^resumes\/[a-f0-9-]{36}\.pdf$/);
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.fileSize).toBe(input.length);
    expect(await readBuffer(stored.storagePath)).toEqual(input);
    expect((await stat(resolveStoragePath(stored.storagePath))).mode & 0o777).toBe(0o600);
    await removeFile(stored.storagePath);
    await expect(readBuffer(stored.storagePath)).rejects.toThrow();
  });

  it("rejects traversal, absolute paths, oversized files and unsafe namespaces", async () => {
    for (const reference of [
      "../../secret.pdf",
      "/etc/passwd",
      "resumes/../../x.pdf",
      "resumes/normal.pdf",
    ])
      expect(() => resolveStoragePath(reference)).toThrow();
    await expect(
      putBuffer(Buffer.alloc(0), { namespace: "resumes", extension: "pdf" }),
    ).rejects.toThrow("nonempty");
    await expect(
      putBuffer(Buffer.alloc(MAX_UPLOAD_BYTES + 1), { namespace: "resumes", extension: "pdf" }),
    ).rejects.toThrow("10 MB");
    await expect(
      putBuffer(Buffer.from("x"), { namespace: "../outside", extension: "pdf" }),
    ).rejects.toThrow("namespace");
  });

  it("rejects upload directory symlinks and file symlinks", async () => {
    const outside = path.join(temporary, "outside");
    const root = path.join(temporary, "private");
    await mkdir(outside);
    await mkdir(root);
    await symlink(outside, path.join(root, "resumes"));
    await expect(
      putBuffer(Buffer.from("x"), { namespace: "resumes", extension: "pdf" }),
    ).rejects.toThrow("symbolic link");
    const reference = "evidence/12345678-1234-1234-1234-123456789abc.pdf";
    await mkdir(path.join(root, "evidence"));
    await symlink(path.join(outside, "private.pdf"), resolveStoragePath(reference));
    await expect(readBuffer(reference)).rejects.toThrow();
  });

  it("strips paths and control characters from download filenames", () => {
    expect(safeFilename("../../private/resume.pdf")).toBe("resume.pdf");
    expect(safeFilename("C:\\private\\resume.pdf")).toBe("resume.pdf");
    expect(contentDisposition("resume\r\nInjected: header.pdf")).not.toContain("\r");
    expect(contentDisposition("résumé.pdf")).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
    expect(() => contentDisposition(`${"a".repeat(179)}📝.pdf`)).not.toThrow();
  });
});
