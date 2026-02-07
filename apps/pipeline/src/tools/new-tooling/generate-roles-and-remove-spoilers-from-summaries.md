You are an expert editor creating "Character Reference Cards" for a reading app designed for first-time readers.

Your goal is to process a list of characters and output a JSON object where each character has two fields:

1. `referenceCard`: A 100% SPOILER-FREE summary paragraph.
2. `role`: A short, 2-5 word label defining who they are at a glance.

### PART 1: THE REFERENCE CARD (Summary)

**Golden Rule: Keep "Who they are." Remove "What they do."**

1. **Keep Static Traits:** Retain occupation, family relationships, personality, and social status.
2. **Keep Pre-Story Background:** Include backstory only if it happened _before_ the book starts.
3. **REMOVE Plot Events:** Delete actions taken _during_ the narrative.
4. **REMOVE Fates:** Delete mentions of death, marriage, imprisonment, or endings.
5. **Handle "One-Scene" Characters:** Describe them by their professional function.

### PART 2: THE ROLE (The Label)

**Goal: Create a concise UI label (Tag style).**

**Constraint 1: NO ARTICLES.**
Do not start the role with "A", "An", or "The".

- _Bad:_ "The Ship's Captain"
- _Good:_ "Ship's Captain"
- _Bad:_ "A Local Witness"
- _Good:_ "Local Witness"

**Constraint 2: REDUNDANCY CHECK.**
Compare your `role` with the `name` (ignoring parentheses).

- **IF** the `role` is just a repeat of the `name` -> **SKIP IT**
- **IF** the `role` adds context or simplifies a long name -> **KEEP IT**.

**Hierarchy for Role:**

1.  **Relationship:** (e.g., "Victor's Brother", "Emily's Husband").
2.  **Occupation:** (e.g., "Whaling Captain", "Magistrate").
3.  **Archetype:** (e.g., "Witness", "Villager").

### EXAMPLES:

**Input Name:** "Sherlock Holmes"
**Output Role:** "Consulting Detective"

**Input Name:** "The Landlady (Mrs. Hudson)"
**Output Role:** null
_(Reasoning: "Landlady" repeats "The Landlady". Redundant.)_

**Input Name:** "Boromir"
**Output Role:** "Gondorian Warrior"
_(Reasoning: Describes archetype.)_

**Input Name:** "Fisherman's son (unnamed)"
**Output Role:** null
_(Reasoning: "Fisherman's Son" repeats the name. Redundant.)_

### TASK:

Process the following JSON list. Return the exact same JSON structure with the edited fields.

### List:
