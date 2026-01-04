/**
 * Extracts JSON from a string that might contain other text and formatting
 * Can be used in Node.js (with require/import) or in browser
 *
 * @param {string} input - The input string containing JSON somewhere within it
 * @returns {object|null} - The parsed JSON object or null if extraction failed
 */
export const extractJSON = <T>(input: string): T | null => {
  if (!input || typeof input !== "string") {
    console.error("Input must be a non-empty string");
    return null;
  }

  try {
    // First attempt: Try to parse the whole string (maybe it's already valid JSON)
    try {
      return JSON.parse(input);
    } catch (e) {
      // Not valid JSON, continue with extraction
    }

    // Look for JSON between JSON code blocks (```json ... ```)
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/m;
    const jsonBlockMatch = input.match(jsonBlockRegex);

    if (jsonBlockMatch && jsonBlockMatch[1]) {
      try {
        return JSON.parse(jsonBlockMatch[1]);
      } catch (e) {
        // JSON in code block wasn't valid, try other methods
      }
    }

    // Look for content between square brackets that might be JSON array
    const arrayMatch = input.match(/\[\s*{[\s\S]*}\s*\]/m);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e) {
        // Not valid JSON array, continue
      }
    }

    // Look for content between curly braces that might be JSON object
    const objectMatch = input.match(/{\s*"[\s\S]*"[\s\S]*}/m);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch (e) {
        // Not valid JSON object, continue
      }
    }

    // More aggressive approach: Try to find JSON by looking for patterns
    // Find the first { or [ and the last } or ]
    const firstBrace = Math.min(
      input.indexOf("{") !== -1 ? input.indexOf("{") : Infinity,
      input.indexOf("[") !== -1 ? input.indexOf("[") : Infinity,
    );

    const lastBrace = Math.max(input.lastIndexOf("}"), input.lastIndexOf("]"));

    if (firstBrace !== Infinity && lastBrace !== -1 && firstBrace < lastBrace) {
      const possibleJSON = input.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(possibleJSON);
      } catch (e: unknown) {
        // Not valid JSON, try with a more specialized approach
      }
    }

    // Last resort: Use a regex pattern to attempt to find valid JSON
    // This looks for either array JSON [...] or object JSON {...}
    const jsonRegex = /(\[[\s\S]*\]|\{[\s\S]*\})/gm;
    const matches = input.match(jsonRegex);

    if (matches) {
      // Try each match until we find valid JSON
      for (const match of matches) {
        try {
          // Only consider matches with substantial content, not empty arrays/objects
          if (match.length > 10) {
            return JSON.parse(match);
          }
        } catch (_) {
          // Continue to next match if this one isn't valid
          continue;
        }
      }
    }

    // Nothing worked
    console.error("Could not extract valid JSON from the input string");
    return null;
  } catch (error) {
    console.error("Error extracting JSON:", error);
    return null;
  }
};
