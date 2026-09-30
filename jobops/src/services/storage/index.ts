import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export type StoredFile = { storagePath: string; sha256: string; fileSize: number };

export function storageRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_ROOT ?? "./data/uploads");
}

export function resolveStoragePath(storagePath: string, root = storageRoot()) {
  if (
    !/^[a-z][a-z0-9_-]*\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-z0-9]{1,8}$/.test(
      storagePath,
    )
  ) {
    throw new Error("Invalid stored file reference.");
  }
  const resolved = path.resolve(/* turbopackIgnore: true */ root, storagePath);
  if (!resolved.startsWith(`${path.resolve(/* turbopackIgnore: true */ root)}${path.sep}`))
    throw new Error("Invalid stored file reference.");
  return resolved;
}

export async function putBuffer(
  buffer: Buffer | Uint8Array,
  options: { namespace: string; extension: string },
): Promise<StoredFile> {
  if (!/^[a-z][a-z0-9_-]*$/.test(options.namespace) || !/^[a-z0-9]{1,8}$/.test(options.extension)) {
    throw new Error("Unsupported storage namespace or extension.");
  }
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES)
    throw new Error("Files must be nonempty and no larger than 10 MB.");
  const root = storageRoot();
  const namespace = path.join(/* turbopackIgnore: true */ root, options.namespace);
  await mkdir(/* turbopackIgnore: true */ namespace, { recursive: true, mode: 0o700 });
  // Resolve both paths: replacing an upload directory with a symlink must never
  // redirect writes outside the private storage root.
  const [actualRoot, actualNamespace] = await Promise.all([
    realpath(/* turbopackIgnore: true */ root),
    realpath(/* turbopackIgnore: true */ namespace),
  ]);
  if (actualNamespace !== path.join(/* turbopackIgnore: true */ actualRoot, options.namespace))
    throw new Error("Storage directory cannot be a symbolic link.");
  const storagePath = `${options.namespace}/${randomUUID()}.${options.extension}`;
  await writeFile(/* turbopackIgnore: true */ resolveStoragePath(storagePath), buffer, {
    flag: "wx",
    mode: 0o600,
  });
  return {
    storagePath,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    fileSize: buffer.byteLength,
  };
}

async function checkedPath(storagePath: string) {
  const filePath = resolveStoragePath(storagePath);
  const entry = await lstat(/* turbopackIgnore: true */ filePath);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Stored file is unavailable.");
  const [root, actual] = await Promise.all([
    realpath(/* turbopackIgnore: true */ storageRoot()),
    realpath(/* turbopackIgnore: true */ filePath),
  ]);
  if (!actual.startsWith(`${root}${path.sep}`)) throw new Error("Stored file is unavailable.");
  return actual;
}

export async function readBuffer(storagePath: string) {
  return readFile(/* turbopackIgnore: true */ await checkedPath(storagePath));
}

export async function removeFile(storagePath: string) {
  await unlink(/* turbopackIgnore: true */ await checkedPath(storagePath));
}

export const removeBuffer = removeFile;

export function safeFilename(filename: string) {
  const basename = path
    .basename(filename.replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "");
  return Array.from(basename).slice(0, 180).join("") || "resume.pdf";
}

export function contentDisposition(filename: string, inline = false) {
  const cleaned = safeFilename(filename);
  const ascii = cleaned.replace(/[^a-zA-Z0-9._ -]/g, "_").replaceAll('"', "_");
  const encoded = encodeURIComponent(cleaned).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
