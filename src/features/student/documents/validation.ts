import {
  MAX_FILE_BYTES,
  MAX_IMAGE_PREVIEW_EDGE,
  MAX_IMAGE_PREVIEW_PIXELS,
} from "../services/config";
import { DomainError } from "../utils/validation";

export interface ValidatedDocument {
  file: File;
  mimeType: string;
  extension: "pdf" | "doc" | "docx" | "jpg" | "jpeg" | "png";
  kind: "pdf" | "office" | "image";
  width?: number;
  height?: number;
  previewUnavailable?:
    "dimensions-unavailable" | "dimensions-exceed-limit" | "decode-unavailable";
}
const types = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
} as const;
function fail(code: string): never {
  throw new DomainError("INVALID_DOCUMENT", `documents.${code}`);
}
export async function readBlobBytes(
  blob: Blob,
): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof blob.arrayBuffer === "function")
    return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new DomainError("DOCUMENT_READ", "documents.readError"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}
function starts(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}
/** Bounded structural ZIP checks only: no extraction, XML execution or malware claim. */
function validDocx(bytes: Uint8Array): boolean {
  if (bytes.length < 22) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let i = bytes.length - 22, min = Math.max(0, bytes.length - 65557);
    i >= min;
    i--
  ) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (
    end < 0 ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0
  )
    return false;
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const offset = view.getUint32(end + 16, true);
  if (
    !count ||
    count === 65535 ||
    count > 4096 ||
    count !== view.getUint16(end + 8, true) ||
    offset + size !== end
  )
    return false;
  const decoder = new TextDecoder();
  const names = new Set<string>();
  const ranges: { start: number; end: number }[] = [];
  let cursor = offset;
  for (let entry = 0; entry < count; entry++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      return false;
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true),
      uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true);
    if (
      flags & (1 | 64 | 8192) ||
      ![0, 8].includes(method) ||
      compressed === 0xffffffff ||
      uncompressed === 0xffffffff ||
      view.getUint16(cursor + 34, true) !== 0 ||
      !nameLength ||
      cursor + 46 + nameLength + extra + comment > end
    )
      return false;
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decoder.decode(nameBytes);
    if (
      names.has(name) ||
      /[\u0000-\u001f\\]/u.test(name) ||
      name.startsWith("/") ||
      name.split("/").includes("..")
    )
      return false;
    if (
      (method === 0 && compressed !== uncompressed) ||
      ((name === "[Content_Types].xml" || name === "word/document.xml") &&
        (compressed === 0 || uncompressed === 0))
    )
      return false;
    names.add(name);
    if (
      local + 30 > offset ||
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      return false;
    const localNameLength = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true);
    const dataStart = local + 30 + localNameLength + localExtra,
      dataEnd = dataStart + compressed;
    if (
      localNameLength !== nameLength ||
      dataStart > offset ||
      dataEnd > offset ||
      !nameBytes.every((value, index) => bytes[local + 30 + index] === value)
    )
      return false;
    if (
      !(flags & 8) &&
      (view.getUint32(local + 18, true) !== compressed ||
        view.getUint32(local + 22, true) !== uncompressed ||
        view.getUint32(local + 14, true) !== view.getUint32(cursor + 16, true))
    )
      return false;
    let recordEnd = dataEnd;
    if (flags & 8) {
      if (dataEnd + 12 > offset) return false;
      const descriptor =
        view.getUint32(dataEnd, true) === 0x08074b50 ? dataEnd + 4 : dataEnd;
      if (
        descriptor + 12 > offset ||
        view.getUint32(descriptor, true) !==
          view.getUint32(cursor + 16, true) ||
        view.getUint32(descriptor + 4, true) !== compressed ||
        view.getUint32(descriptor + 8, true) !== uncompressed
      )
        return false;
      recordEnd = descriptor + 12;
    }
    if (ranges.some((range) => local < range.end && recordEnd > range.start))
      return false;
    ranges.push({ start: local, end: recordEnd });
    cursor += 46 + nameLength + extra + comment;
  }
  return (
    cursor === end &&
    names.has("[Content_Types].xml") &&
    names.has("word/document.xml")
  );
}
/** Inspect only bounded metadata before handing compressed pixels to a browser decoder. */
function imageHeaderDimensions(
  bytes: Uint8Array,
  extension: ValidatedDocument["extension"],
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (extension === "png") {
    if (
      bytes.length < 33 ||
      view.getUint32(8) !== 13 ||
      view.getUint32(12) !== 0x49484452
    )
      return null;
    const width = view.getUint32(16),
      height = view.getUint32(20);
    // Unknown/invalid IHDR encodings are never automatically decoded.
    const depth = bytes[24]!,
      color = bytes[25]!;
    const depths: Record<number, readonly number[]> = {
      0: [1, 2, 4, 8, 16],
      2: [8, 16],
      3: [1, 2, 4, 8],
      4: [8, 16],
      6: [8, 16],
    };
    if (
      !width ||
      !height ||
      !depths[color]?.includes(depth) ||
      bytes[26] !== 0 ||
      bytes[27] !== 0 ||
      ![0, 1].includes(bytes[28]!)
    )
      return null;
    return { width, height };
  }
  const bound = Math.min(bytes.length, 64 * 1024);
  let cursor = 2;
  for (let segments = 0; segments < 256 && cursor < bound; segments++) {
    if (bytes[cursor++] !== 0xff) return null;
    while (cursor < bound && bytes[cursor] === 0xff) cursor++;
    if (cursor >= bound) return null;
    const marker = bytes[cursor++]!;
    if (
      marker === 0xda ||
      marker === 0xd9 ||
      marker === 0 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      return null;
    if (marker === 0x01) continue;
    if (cursor + 2 > bound) return null;
    const length = view.getUint16(cursor);
    if (length < 2 || cursor + length > bound) return null;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      if (length < 11) return null;
      const height = view.getUint16(cursor + 3),
        width = view.getUint16(cursor + 5),
        components = bytes[cursor + 7]!;
      if (
        !width ||
        !height ||
        components < 1 ||
        components > 4 ||
        length !== 8 + 3 * components
      )
        return null;
      return { width, height };
    }
    cursor += length;
  }
  return null;
}
async function measureImage(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const image = await createImageBitmap(file);
      const result = { width: image.width, height: image.height };
      image.close();
      return result.width > 0 && result.height > 0 ? result : null;
    } catch {
      return null;
    }
  }
  if (typeof URL.createObjectURL !== "function" || typeof Image === "undefined")
    return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const image = new Image();
      const timeout = setTimeout(() => {
        image.src = "";
        resolve(null);
      }, 8000);
      image.onload = () => {
        clearTimeout(timeout);
        resolve(
          image.naturalWidth > 0 && image.naturalHeight > 0
            ? { width: image.naturalWidth, height: image.naturalHeight }
            : null,
        );
      };
      image.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function validateFile(file: File): Promise<ValidatedDocument> {
  if (
    !file ||
    typeof file.name !== "string" ||
    !file.name.trim() ||
    file.name.length > 255 ||
    /[\u0000-\u001f\u007f-\u009f/\\]/u.test(file.name)
  )
    fail("invalidName");
  if (!Number.isSafeInteger(file.size) || file.size <= 0) fail("empty");
  if (file.size > MAX_FILE_BYTES) fail("tooLarge");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (
    !extension ||
    !(extension in types) ||
    !Object.prototype.hasOwnProperty.call(types, extension)
  )
    fail("unsupported");
  if (
    file.name.lastIndexOf(".") <= 0 ||
    !file.name.slice(0, file.name.lastIndexOf(".")).trim()
  )
    fail("invalidName");
  const ext = extension as ValidatedDocument["extension"];
  const mimeType = types[ext],
    supplied = file.type.trim().toLowerCase();
  if (
    supplied &&
    supplied !== "application/octet-stream" &&
    supplied !== mimeType
  )
    fail("mimeMismatch");
  const bytes = await readBlobBytes(file);
  let valid = false;
  if (ext === "pdf") {
    for (let i = 0; i + 5 <= Math.min(bytes.length, 1024); i++)
      if (starts(bytes, [37, 80, 68, 70, 45], i)) {
        valid = true;
        break;
      }
  } else if (ext === "png")
    valid = starts(bytes, [137, 80, 78, 71, 13, 10, 26, 10]);
  else if (ext === "jpg" || ext === "jpeg")
    valid = starts(bytes, [255, 216, 255]);
  else if (ext === "doc")
    valid = starts(bytes, [208, 207, 17, 224, 161, 177, 26, 225]);
  else valid = validDocx(bytes);
  if (!valid) fail(ext === "docx" ? "invalidDocx" : "signatureMismatch");
  const kind =
    ext === "pdf"
      ? "pdf"
      : ext === "png" || ext === "jpg" || ext === "jpeg"
        ? "image"
        : "office";
  if (kind !== "image") return { file, mimeType, extension: ext, kind };
  const header = imageHeaderDimensions(bytes, ext);
  if (!header)
    return {
      file,
      mimeType,
      extension: ext,
      kind,
      previewUnavailable: "dimensions-unavailable",
    };
  if (
    header.width > MAX_IMAGE_PREVIEW_EDGE ||
    header.height > MAX_IMAGE_PREVIEW_EDGE ||
    header.width * header.height > MAX_IMAGE_PREVIEW_PIXELS
  ) {
    return {
      file,
      mimeType,
      extension: ext,
      kind,
      previewUnavailable: "dimensions-exceed-limit",
    };
  }
  const dimensions = await measureImage(
    new File([file], file.name, { type: mimeType }),
  );
  // EXIF orientation may rotate a JPEG; either orientation retains the same bounded pixel count.
  if (
    !dimensions ||
    !(
      (dimensions.width === header.width &&
        dimensions.height === header.height) ||
      (dimensions.width === header.height && dimensions.height === header.width)
    )
  ) {
    return {
      file,
      mimeType,
      extension: ext,
      kind,
      previewUnavailable: "decode-unavailable",
    };
  }
  return { file, mimeType, extension: ext, kind, ...dimensions };
}
