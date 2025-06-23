/**
 * Checks if a chapter title is just a number (Arabic or Roman numeral)
 * @param title - The chapter title to check
 * @returns true if the title is just a number, false otherwise
 */
export const isNumberTitle = (title: string): boolean => {
  const trimmedTitle = title.trim();

  // Check if it's an Arabic number
  if (/^\d+$/.test(trimmedTitle)) {
    return true;
  }

  // Check if it's a Roman numeral (basic pattern)
  // This regex matches common Roman numerals like I, II, III, IV, V, VI, VII, VIII, IX, X, etc.
  if (/^(?=[MDCLXVI])M{0,4}(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/i.test(trimmedTitle)) {
    return true;
  }

  return false;
};
