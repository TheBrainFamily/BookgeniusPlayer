# Task

Analyze the provided book text to extract and synthesize **purely physical descriptions** for each character listed. Focus _only_ on visual appearance.

## **Output Goal: Character-Centric Visual Guide**

Generate a JSON object containing a list of characters. Each character entry must have a `name` (exactly as provided in the list) and a `visualGuide` string. This guide is intended for generating static character portraits to help readers remember who is who.

**Visual Guide Content Constraints:**

1.  **Appearance Only:** The `visualGuide` MUST describe only the character's physical appearance: age (estimated if not stated), sex, ethnicity (if mentioned or strongly implied), build, hair, eyes, facial features, distinctive marks (scars, tattoos), clothing, and accessories _if_ they are characteristic or commonly worn.
2.  **Static Portrait:** Describe the character as if they were posing for a single, static portrait. Think nouns and adjectives.
3.  **Format:** Use descriptive phrases, primarily nouns and adjectives. Avoid verbs describing actions or plot events. Phrases like "wearing [item]" or "with [feature]" are acceptable. Keep it to a single paragraph maximum per character.
4.  **Emphasis:** Exaggerate unique visual traits mentioned in the text to make characters distinct.
5.  **Inference:** If the text lacks visual detail, make _plausible inferences_ about appearance based _only_ on context directly relevant to visuals (e.g., setting implies clothing style, name suggests ethnicity, dialogue hints at age). **DO NOT** infer personality, role, relationships, or plot relevance from actions or dialogue.
6.  **Timeframe:** Use the character's appearance as introduced or how they appear most consistently. Ignore future changes in appearance (e.g., due to injury, imprisonment, aging _if_ the story jumps significantly).
7.  **ABSOLUTELY NO SPOILERS:** DO NOT mention actions, roles (like 'official', 'banker', 'servant' unless it directly describes _clothing_, e.g., 'wearing servant's attire'), relationships, events, deaths, changes in status, or any plot points. The description must be safe to read before finishing the book. Assume the reader knows _nothing_.

## Example Snippet (Target Style):

```json5
{
    "name": "great-ramzes",
    "visualGuide": "Young man, around 25, North African ethnicity, olive skin. Sharp cheekbones, noble nose, deep-set dark brown eyes. Wearing regal Egyptian attire: blue and gold-striped Nemes headdress with golden cobra (Uraeus). Confident, thoughtful expression, eyes gazing slightly upward."
},
{
    "name": "jewish-girl",
    "visualGuide": "Young woman, roughly 20, fair olive skin, long dark curly hair. Large expressive hazel eyes with gold flecks, full lips, defined eyebrows. Gentle, thoughtful, subtly melancholic expression. Wearing modest Middle Eastern garments, soft earth tones, subtle gold embroidery."
}
// ... (other characters) ...
```

_(Note how the example focuses purely on visual elements and inferred mood from expression, avoiding roles or actions.)_

## Data Format

Return the _final, complete_ results after processing _all_ chapters in the following JSON structure:

```json5
{
  characters: [
    {
      name: "string", // Character's name tag - MUST MATCH INPUT LIST EXACTLY
      visualGuide: "string", // The visual description following all constraints above
    },
    // ... other character objects
  ],
}
```

## Important Notes

- **Stick to the Visuals:** The core goal is a description for an _image generator_. Focus on what can be _seen_.
- **No Plot Info:** Ensure zero spoilers or plot-relevant details leak into the visual description.
- **Exact Names:** Use the exact character names provided in the list below. Double-check spelling and inclusion of all requested characters.
- **If no info, imagine:** If there are no visual guides in the book, use whatever information you have, even if it's ethnicity and age (is it a baby, child, young man, middle-age, old? if it's not defined, best guess), do not reply that there are no information. Imagine you are a casting director and you need to give some guideliness to the casting people.
- **Reply in English**
- **NEVER SAY WHAT HAPPENS LATER** We stick to one point in time. Do not include information about visuals in different times as we will be generating ONE PICTURE ONLY.
- **DO NOT MENTION RELATIONS** Do not say who is related to who or similar to who, those visual guides will be used independently by different arists that do not know the story or the characters, and their only task will be to draw the avatar based on the VISUAL description.
- **DO NOT SAY "INFERRED"** that information is irrelevant

## Characters to include

{{characters}}

## Book text

{{bookText}}

## Reminder

- **Reply in English**
