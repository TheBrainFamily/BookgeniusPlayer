# Task

Process a text chapter by chapter. For each story character who appears or is mentioned, maintain a record of their background and create summaries reflecting the background for that person.

## **Output Goal: Character-Centric History**

Generate a JSON object where each character has summary about them.

## **Core Principle: Early Introduction Focus**

The summary should primarily draw from information revealed when a character is first introduced — ideally from the very first chapter they appear in. Focus on who the character **is**: their identity, relationships, occupation, and distinguishing traits. Avoid detailing major plot events or twists that happen later in the book. Think of this as building a character profile that helps someone quickly recognize and distinguish this character from others whenever they appear in the text.

## Data Format

Return the _final, complete_ results after processing _all_ chapters in the following JSON structure:

```json5
{
  characters: [
    {
      name: "string", // Character's full name or the way they are usually referenced
      referenceCard: "string",
    },
  ],
}
```

## Important Notes

- Ensure **every character** mentioned, appearing or talking has an entry.
- By "character" consider someone that takes a role in the story. If this was a movie script, consider only people that would require an actor. For example, if someone shouts "Jesus Christ!" and it's not a movie about biblical times, Jesus is most probably not a character. Same if someone says "I watched a Tarantino movie last week", and Tarantino doesn't appear in any scenes, he is also not a character.
- Better to list more characters than less, if unsure, list them.
- Focus on **identifying traits**: role, relationships, occupation, personality, and any aliases or alternate names. The goal is to make it easy to recognize this character whenever they appear in the text.
- If the person is known by two names (e.g. a nickname, maiden name, or title), mention both so they can be matched later.
- Do not write more than 1-2 short sentences about the person. This is a quick character profile, not a plot summary.
- Do not describe their actions or role in their name field.

## Book text
