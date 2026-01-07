/**
 * Typed form data parser for HTTP actions.
 *
 * This helper exists because React Native's FormData type definition lacks
 * the standard DOM FormData methods (.get, .has, etc.). When player-native
 * typechecks convex files, it uses React Native's incomplete FormData type.
 *
 * This function provides a clean, typed API that works across all environments.
 */

type FormDataEntryValue = File | string | Blob | null;

interface ParsedFormData {
  get(name: string): FormDataEntryValue;
  getString(name: string): string | null;
  getBlob(name: string): Blob | null;
}

/**
 * Parse form data from an HTTP request with full type safety.
 * Works around React Native's incomplete FormData type definitions.
 */
export async function parseFormData(request: Request): Promise<ParsedFormData> {
  // The cast is necessary because React Native's FormData types lack .get()
  // Convex runtime has full DOM FormData support
  const formData = (await request.formData()) as unknown as globalThis.FormData;

  return {
    get(name: string): FormDataEntryValue {
      return formData.get(name);
    },
    getString(name: string): string | null {
      const value = formData.get(name);
      return typeof value === "string" ? value : null;
    },
    getBlob(name: string): Blob | null {
      const value = formData.get(name);
      return value instanceof Blob ? value : null;
    },
  };
}
