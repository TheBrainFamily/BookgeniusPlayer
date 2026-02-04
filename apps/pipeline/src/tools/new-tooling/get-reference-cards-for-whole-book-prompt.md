# Task

Process a text chapter by chapter. For each story character who appears or is mentioned, create reference cards reflecting the knowledge about this person - how would a human introduce someone to that character without spoiling it. The information should be based mostly on when we first meet the character, but pointing towards the knowledge we know about him from the whole book - so avoid spoilers, but use the later revealed facts to determine whats important about the initial impression.
Maybe when we first meet the character he is working on his car in his garage. If in the rest of his book he does that from time to time, or we learn he is a mechanic, or a driver, or whatever like that, that's important detail. But if he is not mentioned in the context of cars again, that is irrelevant detail. No spoilers! Do not mention how things end or who they become. Only the most generic but relevant information. So skip anything that's surprising or important action that happened later in the book, but build the background about the person. Who that person was when the story starts. Do not mention any important life changes, like getting married, dying, getting a promotion, unless it happened at the very moment we learn about that person.

## **Output Goal: Character-Centric History**

Generate a JSON object where each character has a reference card.

## Example Snippet (Illustrative - showing how a character's record might build):

```json5
{
    "name": "Sherlock Holmes",
    "referenceCard: "Mysterious detective with uncanny ability to deduct information about people"
},
// ... (other characters) ...
```

## Data Format

Return the _final, complete_ results after processing _all_ chapters in the following JSON structure:

```json5
{
  characters: [
    {
      name: string, // Character's full name
      referenceCard: string,
    },
  ],
}
```

## Important Notes

- Ensure **every character** appearing or talking has an entry.
- By "character" consider someone that takes a role in the story. If this was a movie script, consider only people that would require an actor. For example, if someone shouts "Jesus Christ!" and it's not a movie about biblical times, Jesus is most probably not a character. Same if someone says "I watched a Tarantino movie last week", and Tarantino doesn't appear in any scenes, he is also not a character.
- Focus on reminding the reader who the character _is_ based on past context (role, relationships, key history), not what they _do_ or _say_ in the current chapter (N). Avoid spoilers!
- Do not write more than 1-2 short sentences about the person. This is not a summary of a book, this is a memory-jog to quickly get someone to connect character name with the actual character.
- If the person is known by two names, add the second one in the parentheses.
- Jeśli tekst jest po Polsku, odpowiedz po Polsku

## Book text
