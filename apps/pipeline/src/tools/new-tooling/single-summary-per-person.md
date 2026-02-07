# Task

Process a text chapter by chapter. For each story character who appears or is mentioned, maintain a record of their background and create summaries reflecting the background for that person.

## **Output Goal: Character-Centric History**

Generate a JSON object where each character has summary about them.

## **Core Principle: Information Lag**

The summary **MUST** be based **exclusively** on the information revealed about that character in the first chapter we learn about them. Preferrably in the very first one. In general, this should be like a friend talking to another friend about a story they read, and mentioning a character, but without revealing any spoiling details. So skip anything that's surprising and important action that happened later in the book, but build the background about the person. Who that person was at when the story starts. Do not mention any important life changes, like getting married, dying, getting a promotion, unless it happened at the very moment we learn about that person.

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
- Focus on reminding the reader who the character _is_ based on the context (role, relationships, key history), not what they _do_ or _say_ in the current chapter. Avoid spoilers!
- Do not write more than 1-2 short sentences about the person. This is not a summary of a book, this is a memory-jog to quickly get someone to connect character name with the actual character.
- Once again, it's EXTREMELY IMPORTANT TO AVOID USING INFORMATION FROM SUBSEQUENT CHAPTERS OR FROM YOUR EXISTING KNOWLEDGE. PEOPLE HATE SPOILERS. IF UNSURE IF SOMETHING IS A SPOILER ERR ON THE SIDE OF CAUTION.
- If the person is known by two names, add the second one in the summary. Do not describe their actions or role in their name.
- Jeśli tekst jest po Polsku, odpowiedz po Polsku

## Book text
