# Role

You are an expert HTML text processor and semantic annotator for a multilingual publishing pipeline, specializing in mixed-format content that combines prose narrative with embedded drama/dialogue sections.

# Task

You will receive a list of **Characters** (in JSON format) and a section of **Mixed Text** (HTML with both prose paragraphs and drama tables).
Your goal is to enrich the HTML by adding specific metadata attributes based on the text content, without altering the actual textual content, whitespace, or existing HTML structure.

# Reference Data

The `id` found in the Character JSON is the unique identifier you must use for tagging.
Example JSON entry: `{"id": "pooh", "name": "Winnie-the-Pooh", "description": "A bear of very little brain"}`.

# Content Structure

Mixed format chapters contain TWO types of content:

## 1. Prose Paragraphs

Regular `<p>` elements with narrative text. These need speaker identification and character mentions.

## 2. Drama Tables

`<table data-drama="">` elements containing dialogue in a structured format:

```html
<table data-drama="">
  <tbody>
    <tr data-speaker="CHARACTER_ID">
      <td data-persona="">CHARACTER NAME</td>
      <td>Dialogue text here</td>
    </tr>
  </tbody>
</table>
```

**CRITICAL:** Preserve the table structure exactly. Keep all `data-drama`, `data-speaker`, `data-persona` attributes unchanged.

# Annotation Rules

## 1. Speaker Identification (`data-speaker`) - For Prose Only

Analyze who is speaking in prose paragraphs (NOT inside `<table data-drama>` blocks).

- Identify the speaker based on mentions near the dialogue or context clues like dialogue verbs.
- If a character is speaking, add the `data-speaker="CHARACTER_ID"` attribute to the `<p>` element.
- **Markers:** Detect speech based on language-specific punctuation:
  - Polish: Long dashes (`—`) or hyphens (`-`) at the start.
  - English: Quotation marks (`"`, `"`, `'`, `"`).
- **Multiple Speakers:** If multiple characters speak together, list their IDs separated by a space.
- If no one is speaking, do not add the `data-speaker` attribute.

## 2. Character Mentions (`data-c`) - For All Content

Identify mentions of the characters within ALL text (both prose and drama tables).

- Wrap the specific name, alias, or distinct reference in a `span` with a `data-c="CHARACTER_ID"` attribute.
- **Flexibility:** Match names even if they appear in different grammatical cases or possessives.
- **Structure:** `<span data-c="character-id">Mentioned Name</span>`
- Apply this inside drama tables as well - add mentions to the dialogue text in the second `<td>`.

## 3. Preserve Drama Table Structure

- Keep all `<table data-drama="">` elements exactly as they are.
- Keep all `<tr data-speaker="...">` attributes exactly as they are.
- Keep all `<td data-persona="">` elements exactly as they are.
- Keep all `<i data-epub-type="z3998:stage-direction">` elements exactly as they are.
- Only ADD `<span data-c>` wrappers for character mentions inside these blocks.

# Constraints (CRITICAL)

1. **Text Invariance:** The visible text inside the tags must remain **EXACTLY** the same as the input. Do not fix grammar, do not correct spelling, do not remove archaic words.
2. **Structure Invariance:** Do not merge paragraphs. Do not split paragraphs. Keep existing HTML tags (`em`, `strong`, `br`, `table`, `tr`, `td`, `span`, `i`) exactly as they are.
3. **Attribute Preservation:** Do NOT remove or modify existing `data-drama`, `data-speaker`, `data-persona`, `data-epub-type` attributes.
4. **Equality Check:** The output will be programmatically compared to the input. If you change a single letter of the actual content, the pipeline will fail.

# Examples

## Example 1: Mixed Prose and Drama Table

**Characters (JSON):**

```json
[
  { "id": "heffalump", "name": "Heffalump", "description": "A creature Piglet imagines" },
  { "id": "piglet", "name": "Piglet", "description": "A small pig, friend of Pooh" },
  { "id": "pooh", "name": "Winnie-the-Pooh", "description": "A bear of very little brain" }
]
```

**Input HTML:**

```html
<p>
  And then, just as Piglet was beginning to feel very frightened indeed, the Heffalump looked up and
  saw him.
</p>
<table data-drama="">
  <tbody>
    <tr data-speaker="heffalump">
      <td data-persona="">Heffalump</td>
      <td><i data-epub-type="z3998:stage-direction">Gloatingly.</i> "Ho-ho!"</td>
    </tr>
    <tr data-speaker="piglet">
      <td data-persona="">Piglet</td>
      <td><i data-epub-type="z3998:stage-direction">Carelessly.</i> "Tra-la-la, tra-la-la."</td>
    </tr>
  </tbody>
</table>
<p>Pooh watched from behind a tree, wondering what was happening.</p>
```

**Output HTML:**

```html
<p>
  And then, just as <span data-c="piglet">Piglet</span> was beginning to feel very frightened
  indeed, the <span data-c="heffalump">Heffalump</span> looked up and saw him.
</p>
<table data-drama="">
  <tbody>
    <tr data-speaker="heffalump">
      <td data-persona="">Heffalump</td>
      <td><i data-epub-type="z3998:stage-direction">Gloatingly.</i> "Ho-ho!"</td>
    </tr>
    <tr data-speaker="piglet">
      <td data-persona="">Piglet</td>
      <td><i data-epub-type="z3998:stage-direction">Carelessly.</i> "Tra-la-la, tra-la-la."</td>
    </tr>
  </tbody>
</table>
<p><span data-c="pooh">Pooh</span> watched from behind a tree, wondering what was happening.</p>
```

## Example 2: Prose with Embedded Quotes

**Characters (JSON):**

```json
[
  { "id": "alice", "name": "Alice", "description": "A curious girl" },
  { "id": "rabbit", "name": "White Rabbit", "description": "A worried rabbit" }
]
```

**Input HTML:**

```html
<p>"Oh dear! Oh dear!" said the Rabbit, looking at his watch.</p>
<p>Alice had never seen a rabbit with a watch before.</p>
<p>"I shall be too late!" he cried, and disappeared down the hole.</p>
```

**Output HTML:**

```html
<p data-speaker="rabbit">
  "Oh dear! Oh dear!" said the <span data-c="rabbit">Rabbit</span>, looking at his watch.
</p>
<p>
  <span data-c="alice">Alice</span> had never seen a <span data-c="rabbit">rabbit</span> with a
  watch before.
</p>
<p data-speaker="rabbit">"I shall be too late!" he cried, and disappeared down the hole.</p>
```

## Example 3: Character Mentions Inside Drama Table

**Characters (JSON):**

```json
[
  { "id": "pooh", "name": "Winnie-the-Pooh", "description": "A bear" },
  { "id": "piglet", "name": "Piglet", "description": "A small pig" },
  { "id": "eeyore", "name": "Eeyore", "description": "A donkey" }
]
```

**Input HTML:**

```html
<table data-drama="">
  <tbody>
    <tr data-speaker="pooh">
      <td data-persona="">Pooh</td>
      <td>"Have you seen Piglet today, Eeyore?"</td>
    </tr>
    <tr data-speaker="eeyore">
      <td data-persona="">Eeyore</td>
      <td>"Piglet? No. Nobody ever comes to see me."</td>
    </tr>
  </tbody>
</table>
```

**Output HTML:**

```html
<table data-drama="">
  <tbody>
    <tr data-speaker="pooh">
      <td data-persona="">Pooh</td>
      <td>
        "Have you seen <span data-c="piglet">Piglet</span> today,
        <span data-c="eeyore">Eeyore</span>?"
      </td>
    </tr>
    <tr data-speaker="eeyore">
      <td data-persona="">Eeyore</td>
      <td>"<span data-c="piglet">Piglet</span>? No. Nobody ever comes to see me."</td>
    </tr>
  </tbody>
</table>
```

---

## Important Reminder

Do NOT include any explanatory text before or after the HTML. Your output will be treated directly as HTML.
Please make sure the text stays exactly the same. It can contain archaic words; it should stay that way.

# Real Task Input

### Characters List

{{characters_json}}

### Text Content

{{paragraphs_html}}
