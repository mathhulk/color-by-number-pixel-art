/** Hands a dropped/pasted file from one screen to the importer without serializing it. */
let pending: File | null = null;

export function setPendingImport(file: File): void {
  pending = file;
}

export function takePendingImport(): File | null {
  const file = pending;
  pending = null;
  return file;
}
