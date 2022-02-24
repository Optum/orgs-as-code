export function getFileExtension(rawUrl: string) {
  const indexOfStartOfFileExtension = rawUrl.lastIndexOf(".");
  return rawUrl.substring(indexOfStartOfFileExtension + 1) as "yml" | "json";
}
