export const allVariants = [
  {
    id: "ch1-p1-s1",
    analysis: {
      originalSentence:
        "<Alice>Alice</Alice> was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought <Alice>Alice</Alice> 'without pictures or conversation?'",
      reasoning:
        "The sentence is exceptionally long and structurally complex. It contains multiple clauses joined by conjunctions ('and', 'but') and a colon, creating a run-on, stream-of-consciousness style. The most complex feature is the embedded, interrupted dialogue ('...thought <Alice>Alice</Alice>...'), which requires the reader to hold multiple syntactic parts in their mind at once. While the vocabulary itself is common, the sheer length and convoluted syntax elevate the complexity significantly, making it characteristic of ornate classic literature.",
      score: 80,
    },
    simplifications: [
      {
        reasoning:
          "This version breaks the single long sentence into three more manageable, though still complex, sentences. It simplifies the structure by removing the colon and standardizing the quotation format, making the flow of ideas easier to follow. This aligns with a clear Young Adult or standard adult prose style.",
        score: 65,
        sentences: [
          "<Alice>Alice</Alice> was getting very tired of sitting by her sister on the bank with nothing to do.",
          "She had peeped into her sister's book once or twice, but it had no pictures or conversations in it.",
          '"And what is the use of a book," <Alice>Alice</Alice> thought, "without pictures or conversation?"',
        ],
      },
      {
        reasoning:
          "This simplification breaks the original sentence into four short, distinct sentences. It simplifies vocabulary ('getting very tired' to 'was bored') and uses direct, declarative statements to convey the sequence of events and thoughts. The structure is straightforward, focusing on one idea per sentence, which is typical of Middle Grade prose.",
        score: 50,
        sentences: [
          "<Alice>Alice</Alice> was bored sitting by her sister on the bank.",
          "She had nothing to do.",
          "She looked into her sister's book, but it had no pictures or conversations.",
          '"What is the use of a book without pictures or conversation?" <Alice>Alice</Alice> thought.',
        ],
      },
      {
        reasoning:
          "This version reduces the original idea to its most basic components, using very short, simple sentences with high-frequency vocabulary. Each sentence follows a basic Subject-Verb-Object pattern. The final thought is also simplified into a direct statement. This level of simplicity is suitable for early chapter books.",
        score: 40,
        sentences: [
          "<Alice>Alice</Alice> was tired and bored.",
          "She sat with her sister but had nothing to do.",
          "Her sister's book had no pictures in it.",
          "<Alice>Alice</Alice> thought a book was useless without pictures.",
        ],
      },
    ],
  },
  {
    id: "ch1-p2-s1",
    analysis: {
      originalSentence:
        "So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a <White-Rabbit>White Rabbit</White-Rabbit> with pink eyes ran close by her.",
      reasoning:
        "This sentence is exceptionally long and syntactically complex. It features a long, nested parenthetical clause '(as well as she could, for the hot day...)' which itself contains multiple clauses. The main idea, a character's internal deliberation, is expressed through a complex 'whether' clause that spans 20 words. This structure, which delays the main event until the very end, is characteristic of ornate, classic literature. While the vocabulary is not overly academic, the sheer grammatical complexity and length justify a high score.",
      score: 80,
    },
    simplifications: [
      {
        reasoning:
          "This simplification breaks the original sentence into three, untangling the complex syntax. It extracts the parenthetical information into its own sentence and rephrases the long deliberation into a more direct compound sentence. The flow is clearer and more aligned with a standard Young Adult prose style.",
        score: 60,
        sentences: [
          "The hot day made her feel very sleepy and stupid, so it was hard for her to think clearly.",
          "She was wondering if the fun of making a daisy-chain was worth the effort of getting up to pick the flowers.",
          "Just then, a <White-Rabbit>White Rabbit</White-Rabbit> with pink eyes suddenly ran close by her.",
        ],
      },
      {
        reasoning:
          "This version deconstructs the original into four short, declarative sentences. It uses simple, high-frequency vocabulary and focuses on concrete states and actions, breaking the complex thought process into a simple question. The Subject-Verb-Object structure makes it very direct and easy to read.",
        score: 40,
        sentences: [
          "She felt sleepy and stupid because of the hot day.",
          "She thought about making a daisy-chain.",
          "But she would have to get up and pick the daisies.",
          "Suddenly, a <White-Rabbit>White Rabbit</White-Rabbit> with pink eyes ran by.",
        ],
      },
    ],
  },
  {
    id: "ch1-p3-s1",
    analysis: {
      originalSentence:
        "There was nothing so <em>very</em> remarkable in that; nor did <Alice>Alice</Alice> think it so <em>very</em> much out of the way to hear the <White-Rabbit>Rabbit</White-Rabbit> say to itself, 'Oh dear! Oh dear! I shall be late!' (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the <White-Rabbit>Rabbit</White-Rabbit> actually <em>took a watch out of its waistcoat-pocket,</em> and looked at it, and then hurried on, <Alice>Alice</Alice> started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.",
      reasoning:
        "This sentence scores highly due to its extreme length and complex syntax. It is a single, sprawling compound-complex sentence containing multiple subordinate clauses, a long parenthetical thought that breaks the narrative flow, and several coordinated actions linked by 'and'. The vocabulary itself ('remarkable', 'waistcoat-pocket', 'curiosity') is mature but not overly academic. The primary complexity comes from the sheer cognitive load required to parse the nested structure and track the sequence of events and thoughts, a hallmark of ornate 19th-century prose.",
      score: 80,
    },
    simplifications: [
      {
        reasoning:
          "This version breaks the single long sentence into several shorter, more manageable sentences. It untangles the complex structure by separating the initial observation, the parenthetical reflection, the key action, and Alice's reaction into distinct narrative beats. The sentences are still compound-complex but the overall structure is more direct and easier to follow, typical of clear young adult prose.",
        score: 60,
        sentences: [
          "At first, nothing seemed very remarkable to <Alice>Alice</Alice>, and she didn't think it was strange to hear the <White-Rabbit>Rabbit</White-Rabbit> worry about being late.",
          "Later she realized she should have been surprised, but at the time it all seemed quite natural.",
          "However, when the <White-Rabbit>Rabbit</White-Rabbit> actually took a watch from its waistcoat-pocket, looked at it, and then hurried on, <Alice>Alice</Alice> jumped to her feet.",
          "It flashed across her mind that she had never before seen a rabbit with a waistcoat-pocket or a watch.",
          "Burning with curiosity, she ran across the field after it and was just in time to see it pop down a large rabbit-hole.",
        ],
      },
      {
        reasoning:
          "This simplification reduces the passage to its core actions using short, simple, and declarative sentences. Complex vocabulary is replaced with more common words, and complex clauses are eliminated. The nuance of Alice's internal reflection is removed to focus entirely on the direct sequence of events. The result is unambiguous and easy to read, suitable for early chapter books.",
        score: 40,
        sentences: [
          "<Alice>Alice</Alice> heard the <White-Rabbit>Rabbit</White-Rabbit> talking to itself.",
          "It said, 'Oh dear! I shall be late!'",
          "Then the <White-Rabbit>Rabbit</White-Rabbit> took a watch out of its pocket and looked at it.",
          "<Alice>Alice</Alice> was very surprised because she had never seen a rabbit with a watch.",
          "She jumped up and ran after the <White-Rabbit>Rabbit</White-Rabbit>.",
          "She saw it go down a big rabbit-hole.",
        ],
      },
    ],
  },
  {
    id: "ch1-p4-s1",
    analysis: {
      originalSentence: "In another moment down went <Alice>Alice</Alice> after it, never once considering how in the world she was to get out again.",
      reasoning:
        "The sentence's complexity comes from its syntax. It uses an inverted structure ('down went <Alice>Alice</Alice>') which is less common and harder to parse than a standard subject-verb order. It is a single, moderately long sentence containing a complex participial phrase ('never once considering...') which itself includes an embedded clause ('how... she was to get out again'). This multi-layered grammatical structure increases the cognitive load, despite the vocabulary being relatively common.",
      score: 60,
    },
    simplifications: [
      {
        reasoning:
          "This version simplifies the sentence by removing the inverted syntax and splitting the single complex sentence into two simpler ones. It maintains the original's meaning and vocabulary but presents the information in a more direct, sequential manner, typical of middle-grade prose.",
        score: 50,
        sentences: ["In another moment, <Alice>Alice</Alice> went down after it.", "She didn't even consider how she would get out again."],
      },
      {
        reasoning:
          "This option breaks the original idea into two short, declarative sentences with a clear Subject-Verb-Object structure. It removes the subordinate clause and uses simpler vocabulary ('did not think'), making the sentence very direct and suitable for early readers.",
        score: 40,
        sentences: ["<Alice>Alice</Alice> went down after it.", "She did not think about how to get out."],
      },
    ],
  },
  {
    id: "ch1-p5-s1",
    analysis: {
      originalSentence:
        "The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that <Alice>Alice</Alice> had not a moment to think about stopping herself before she found herself falling down a very deep well.",
      reasoning:
        "This is a long, 45-word sentence with a compound-complex structure. It begins with a compound clause ('went straight on... and then dipped') and then adds two layers of subordinate clauses: a result clause ('so suddenly that...') and a temporal clause ('before she found herself...'). This multi-layered syntax, combined with its sheer length, requires significant focus to parse, even though the vocabulary itself is fairly common. The repetition of 'suddenly' and the phrase 'had not a moment to think' add a degree of literary flourish that elevates its complexity beyond simple prose.",
      score: 68,
    },
    simplifications: [
      {
        reasoning:
          "This version breaks the single complex sentence into two, simplifying the syntax. The first sentence is a clear compound sentence describing the path. The second sentence simplifies the complex 'so...that...before' structure into a more direct statement about the fall, making the cause and effect easier to follow. This aligns with clear Middle Grade prose.",
        score: 50,
        sentences: [
          "The rabbit-hole went on like a tunnel for a while and then suddenly dipped down.",
          "<Alice>Alice</Alice> had no time to think about stopping herself as she began to fall down a very deep well.",
        ],
      },
      {
        reasoning:
          "This option deconstructs the original sentence into four short, simple, declarative sentences. Each sentence focuses on a single action or description. It removes all complex clauses and uses very high-frequency vocabulary, resulting in a text that is easy to read and aligns with the Simple & Declarative level.",
        score: 40,
        sentences: [
          "The rabbit-hole was like a tunnel.",
          "Then it suddenly went straight down.",
          "<Alice>Alice</Alice> could not stop herself.",
          "She was falling down a very deep well.",
        ],
      },
    ],
  },
  {
    id: "ch1-p6-s1",
    analysis: {
      originalSentence:
        "Either the well was very deep, or she fell very slowly, for she had plenty of time as she went down to look about her and to wonder what was going to happen next.",
      reasoning:
        "This is a long, compound-complex sentence. Its complexity comes from its structure: the 'Either/or' correlative conjunction presents two alternative possibilities, which are then explained by a third clause introduced by 'for'. This logical layering requires the reader to track multiple ideas. The sentence also includes a subordinate clause ('as she went down') and two infinitive phrases of purpose. While the vocabulary is common, the syntactic intricacy and length of 35 words place it in the higher complexity range for narrative prose.",
      score: 62,
    },
    simplifications: [
      {
        reasoning:
          "This version breaks the single complex sentence into three shorter, more manageable sentences. It removes the challenging 'Either/or...for' construction, simplifying the logical flow. The result is a clear sequence of events and thoughts, suitable for a Middle Grade reading level.",
        score: 50,
        sentences: [
          "The well was very deep, or maybe she fell very slowly.",
          "Because of this, she had plenty of time to look around as she went down.",
          "She wondered what would happen next.",
        ],
      },
      {
        reasoning:
          "This option deconstructs the original into four very short, declarative sentences. Each sentence focuses on a single, simple idea with a basic Subject-Verb-Object structure. All complex conjunctions are removed, making the meaning highly direct and accessible.",
        score: 40,
        sentences: ["The well was very deep.", "Or perhaps she fell very slowly.", "She had plenty of time to look around.", "She wondered what would happen."],
      },
    ],
  },
  {
    id: "ch1-p6-s2",
    analysis: {
      originalSentence:
        "First, she tried to look down and make out what she was coming to, but it was too dark to see anything; then she looked at thesides of the well, and noticed that they were filled with cupboards and book-shelves; here and there she saw maps and pictures hung upon pegs.",
      reasoning:
        "The sentence is very long (56 words) and structurally complex, using multiple clauses linked by commas, a conjunction ('but'), and semicolons to create a single, continuous thought. This structure, common in classic literature, requires significant attention from the reader to parse the sequence of actions and observations. While the vocabulary is common, the syntactic complexity and information density justify a high score, placing it in the 'Ornate & Descriptive' category.",
      score: 80,
    },
    simplifications: [
      {
        reasoning:
          "This version breaks the long, multi-part original sentence into three shorter, more focused sentences. It removes the semicolons, which are a marker of higher complexity, and separates the distinct actions (looking down, looking sideways, noticing details) for easier comprehension. The resulting sentences are still compound, fitting a clear young adult prose style.",
        score: 60,
        sentences: [
          "First, she tried to look down to see what was below her, but it was too dark to see anything.",
          "Then, she looked at the sides of the well and noticed they were filled with cupboards and book-shelves.",
          "Here and there, she saw maps and pictures hanging on pegs.",
        ],
      },
      {
        reasoning:
          "This simplification deconstructs the original complex sentence into five short, simple sentences. Each sentence focuses on a single action or observation, using a direct Subject-Verb-Object structure. Complex phrases like 'make out what she was coming to' and 'hung upon pegs' are removed in favor of more basic language, making it highly accessible and declarative.",
        score: 40,
        sentences: [
          "First, she tried to look down.",
          "It was too dark to see anything.",
          "Then she looked at the sides of the well.",
          "She saw cupboards and book-shelves.",
          "She also saw maps and pictures on pegs.",
        ],
      },
    ],
  },
  {
    id: "ch1-p6-s3",
    analysis: {
      originalSentence:
        "She took down a jar from one of the shelves as she passed; it was labelled 'ORANGE MARMALADE', but to her great disappointment it was empty: she did not like to drop the jar for fear of killing somebody, so managed to put it into one of the cupboards as she fell past it.",
      reasoning:
        "The sentence is exceptionally long at 58 words. Its primary complexity comes from its syntax: it is a compound-complex sentence linking four distinct clauses with a semicolon, a colon, and coordinating conjunctions ('but', 'so'). This structure, which describes a continuous stream of action and thought ('as she passed', 'as she fell past it'), requires significant cognitive load to parse. While the vocabulary is not overly academic, the grammatical intricacy and sheer length are characteristic of ornate, classic literature.",
      score: 80,
    },
    simplifications: [
      {
        reasoning:
          "This version breaks the original into three clearer, shorter sentences. It retains some grammatical complexity with subordinate clauses ('as she passed') and conjunctions ('so'), but the separation into distinct thoughts greatly improves readability. This style is common in standard young adult prose.",
        score: 60,
        sentences: [
          "As she passed, she took down a jar from a shelf that was labeled 'ORANGE MARMALADE'.",
          "To her great disappointment, it was empty.",
          "She didn't want to drop the jar for fear of killing someone, so she put it into a cupboard as she fell past.",
        ],
      },
      {
        reasoning:
          "This option deconstructs the original into five short, simple sentences, each focused on a single action or feeling. It uses high-frequency vocabulary and a direct Subject-Verb-Object structure, removing complex clauses and punctuation for maximum clarity, which is typical of early chapter books.",
        score: 40,
        sentences: [
          "She took a jar from a shelf.",
          "The label said 'ORANGE MARMALADE'.",
          "The jar was empty, and she was disappointed.",
          "She did not want to drop it and kill somebody.",
          "As she fell, she put the jar into a cupboard.",
        ],
      },
    ],
  },
];
