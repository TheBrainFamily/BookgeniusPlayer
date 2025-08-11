import type { CharacterDefinition, ValidationError } from './types';

export function parseCharactersMaster(xmlContent: string): CharacterDefinition[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');
  const characters: CharacterDefinition[] = [];
  
  const charactersMaster = doc.querySelector('CharactersMaster');
  if (!charactersMaster) return characters;
  
  const children = charactersMaster.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    characters.push({
      name: child.tagName,
      display: child.getAttribute('display') || '',
      summary: child.getAttribute('summary') || ''
    });
  }
  
  return characters;
}

export function validateChapterXml(
  chapterContent: string, 
  validCharacters: CharacterDefinition[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = chapterContent.split('\n');
  
  // Create a set of valid character names for quick lookup
  const validCharacterNames = new Set(validCharacters.map(char => char.name));
  
  // Regular expression to find XML tags that start with capital letters
  const capitalTagRegex = /<([A-Z][a-zA-Z0-9-]*)(>|\/?>)/g;
  const closingTagRegex = /<\/([A-Z][a-zA-Z0-9-]*)>/g;
  
  // Track open tags within each paragraph
  const paragraphStack: { tag: string; line: number; column: number }[] = [];
  let inParagraph = false;
  
  lines.forEach((line, lineIndex) => {
    // Check if we're entering or leaving a paragraph
    if (line.includes('<p>') || line.includes('<p ')) {
      inParagraph = true;
      paragraphStack.length = 0; // Clear stack for new paragraph
    }
    
    if (line.includes('</p>')) {
      // Check if there are unclosed tags
      if (paragraphStack.length > 0) {
        paragraphStack.forEach(openTag => {
          errors.push({
            line: openTag.line,
            column: openTag.column,
            endLine: openTag.line,
            endColumn: openTag.column + openTag.tag.length + 2,
            message: `Tag <${openTag.tag}> is not closed within the paragraph`,
            severity: 'error'
          });
        });
      }
      inParagraph = false;
      paragraphStack.length = 0;
    }
    
    // Find all capital letter tags in the line
    let match;
    
    // Check opening tags
    capitalTagRegex.lastIndex = 0;
    while ((match = capitalTagRegex.exec(line)) !== null) {
      const tagName = match[1];
      const column = match.index;
      
      // Skip known XML elements
      if (['Chapter', 'CharactersMaster'].includes(tagName)) {
        continue;
      }
      
      // Check if it's a valid character reference
      if (!validCharacterNames.has(tagName)) {
        errors.push({
          line: lineIndex + 1,
          column: column + 1,
          endLine: lineIndex + 1,
          endColumn: column + match[0].length + 1,
          message: `Unknown character reference: <${tagName}>. Available characters are: ${Array.from(validCharacterNames).join(', ')}`,
          severity: 'error'
        });
      } else if (inParagraph && !match[0].endsWith('/>')) {
        // Track opening tags in paragraphs
        paragraphStack.push({
          tag: tagName,
          line: lineIndex + 1,
          column: column + 1
        });
      }
    }
    
    // Check closing tags
    closingTagRegex.lastIndex = 0;
    while ((match = closingTagRegex.exec(line)) !== null) {
      const tagName = match[1];
      
      if (inParagraph && validCharacterNames.has(tagName)) {
        // Remove from stack if it matches the most recent opening tag
        const lastIndex = paragraphStack.findLastIndex(item => item.tag === tagName);
        if (lastIndex !== -1) {
          paragraphStack.splice(lastIndex, 1);
        }
      }
    }
  });
  
  return errors;
}