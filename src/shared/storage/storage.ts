import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "@/shared/env";
import { ValidationError } from "@/shared/errors";

/**
 * File storage abstraction (SDS Doc 02 Ch8).
 * Version 1 ships the local filesystem provider; the interface allows future
 * S3-compatible providers without touching business logic. Files live outside
 * the web root and are only served through authorized download endpoints.
 */

export interface StoredFile {
  /** Provider-relative storage key (never a client-controlled path). */
  storageKey: string;
  fileSize: number;
  checksum: string;
}

export interface StorageProvider {
  save(content: Buffer, extension: string, prefix: string): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
  exists(storageKey: string): Promise<boolean>;
  delete(storageKey: string): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9/_.-]+$/i;

class LocalStorageProvider implements StorageProvider {
  private root(): string {
    return path.resolve(env().STORAGE_PATH);
  }

  private resolveKey(storageKey: string): string {
    if (!SAFE_KEY.test(storageKey) || storageKey.includes("..")) {
      throw new ValidationError("Invalid storage key.");
    }
    const resolved = path.resolve(this.root(), storageKey);
    if (!resolved.startsWith(this.root())) {
      throw new ValidationError("Invalid storage key.");
    }
    return resolved;
  }

  async save(content: Buffer, extension: string, prefix: string): Promise<StoredFile> {
    const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "misc";
    const now = new Date();
    const dir = path.posix.join(
      safePrefix,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
    );
    const storageKey = path.posix.join(dir, `${crypto.randomUUID()}.${safeExtension}`);
    const absolute = this.resolveKey(storageKey);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content);
    return {
      storageKey,
      fileSize: content.length,
      checksum: crypto.createHash("sha256").update(content).digest("hex"),
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export const storage: StorageProvider = new LocalStorageProvider();

// ---------------------------------------------------------------------------
// Upload validation (SDS Doc 05 Ch6 / Doc 12 Ch7)
// ---------------------------------------------------------------------------

const EXECUTABLE_EXTENSIONS = new Set([
  "exe", "dll", "bat", "cmd", "com", "msi", "scr", "ps1", "sh", "vbs", "js",
  "jar", "app", "deb", "rpm", "apk",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  zip: "application/zip",
  csv: "text/csv",
  txt: "text/plain",
};

export function fileExtension(fileName: string): string {
  return path.extname(fileName).replace(".", "").toLowerCase();
}

export function mimeForExtension(extension: string): string {
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^\w.\- ()]/g, "_").slice(0, 200);
  return base || "file";
}

export function validateUpload(
  fileName: string,
  fileSize: number,
  allowedExtensions: string[],
  maxSizeMb: number,
): void {
  const extension = fileExtension(fileName);
  if (!extension || EXECUTABLE_EXTENSIONS.has(extension)) {
    throw new ValidationError("This file type is not permitted.");
  }
  if (!allowedExtensions.map((ext) => ext.toLowerCase()).includes(extension)) {
    throw new ValidationError(
      `Unsupported file type ".${extension}". Allowed: ${allowedExtensions.join(", ")}.`,
    );
  }
  if (fileSize <= 0) {
    throw new ValidationError("The uploaded file is empty.");
  }
  if (fileSize > maxSizeMb * 1024 * 1024) {
    throw new ValidationError(`File exceeds the maximum size of ${maxSizeMb} MB.`);
  }
}
