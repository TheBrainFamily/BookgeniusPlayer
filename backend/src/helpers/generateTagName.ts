// Helper function to generate a valid XML tag name from a character name
export function generateTagName(name: string, forCharactersMaster = false): string {
  const polishMap: { [key: string]: string } = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
    Ą: "A",
    Ć: "C",
    Ę: "E",
    Ł: "L",
    Ń: "N",
    Ó: "O",
    Ś: "S",
    Ź: "Z",
    Ż: "Z",
  };

  let tagName = name
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (char) => polishMap[char] || char) // Replace Polish characters
    .replace(/[,()]/g, "") // Remove , ( )
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .trim(); // Trim whitespace

  // Remove any remaining characters not allowed in XML tag names (simplified)
  tagName = tagName.replace(/[^a-zA-Z0-9\-_.:]/g, "");

  // Ensure it starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(tagName)) {
    tagName = "_" + tagName; // Prefix with underscore if invalid start
  }

  if (forCharactersMaster) {
    return tagName;
  }
  return tagName.toLowerCase();
}
