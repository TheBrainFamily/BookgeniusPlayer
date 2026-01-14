# Task

Analyze the provided chapter text. Identify mentions of characters defined in the <CharactersMaster> list. Wrap each identified character name in the chapter text with its corresponding XML tag from the <CharactersMaster> list (e.g., <Ksiaze-Ramzes>Ramzes</Ksiaze-Ramzes>). If a character is speaking in a paragraph starting with '—', add a self-closing tag like <CharacterName talking="true"/> before the dialogue line. Output the entire modified chapter structure, excluding the <CharactersMaster> section, as a single, valid XML block. Do NOT include any explanatory text before or after the XML.
Identify the speaker based on mentions near the dialogue or context clues like dialogue verbs. Match character names even if they appear in different grammatical cases (declensions).

**CRITICAL: Preserve the original paragraph structure exactly. Each line in the original should remain as a separate paragraph element. Do not combine multiple lines into single paragraphs.**

## Example

When I send

```xml
<CharactersMaster>
    <Ksiaze-Ramzes display="Książe Ramzes" summary="Młodszy syn faraona" />
    <Nikotris display="Nikotris" summary="Królowa Egiptu, matka Ramzesa" />
    <Herhor display="Tutmozis" summary="Dowódca Armii" />
    <Sara display="Sara" summary="Piękna Hebrajka, ukochana Ramzesa" />
    <Tutmozis display="Tutmozis" summary="Krewny Ramzesa, koncentrujący się na uciechach" />
</CharactersMaster>
```

```xml
<Chapter id="1">
<p>
    Dopiero czwarty syn, Ramzes, urodzony z królowej Nikotris, córki arcykapłana Amenhotepa był silny jak wół Api, odważny jak lew i mądry jak kapłani. Od dzieciństwa otaczał się wojskowymi i jeszcze będąc zwyczajnym księciem, mawiał:
</p>

<p>
    — Gdyby bogowie, zamiast młodszym synem królewskim, uczynili mnie faraonem, podbiłbym dziewięć narodów…
</p>

<p>
    Książę spojrzał na Sarę, a jego wzrok złagodniał.
</p>

<p>
    — Panie mój, twe słowa są jak światło w ciemności. — wyszeptała.
</p>
<p>
    - Chodźmy zatem. Czcigodna matka Ramzesa wzywa. - zarządził Herhor.
</p>
</Chapter>
```

I want to receive

```xml
 <Chapter id="1">
    <p>
      Dopiero czwarty syn, <Ksiaze-Ramzes>Ramzes</Ksiaze-Ramzes>, urodzony z królowej <Nikotris>Nikotris</Nikotris>, córki arcykapłana Amenhotepa był silny jak wół Api, odważny jak lew i mądry jak kapłani. Od dzieciństwa otaczał się wojskowymi i jeszcze będąc zwyczajnym księciem, mawiał:
    </p>

    <p>
      <Ksiaze-Ramzes talking="true"/>
      — Gdyby bogowie, zamiast młodszym synem królewskim, uczynili mnie faraonem, podbiłbym dziewięć narodów…
    </p>

    <p>
        <Ksiaze-Ramzes>Książę</Ksiaze-Ramzes> spojrzał na <Sara>Sarę</Sara>, a jego wzrok złagodniał.
    </p>

    <p>
      <Sara talking="true"/>
      — Panie mój, twe słowa są jak światło w ciemności — wyszeptała.
    </p>

    <p>
      <Herhor talking="true"/>
      - Chodźmy zatem. Czcigodna <Nikotris>matka Ramzesa</Nikotris> wzywa. - zarządził <Herhor>Herhor</Herhor>.
    </p>
  </Chapter>
```

Other example with different conversation formatting:

Input:

```xml
<Chapter id="1">
<p>'But they were <em>in</em> the well,' Alice said to the Dormouse, not choosing to notice this last remark.</p>
<p>'Of course they were', said the Dormouse; '—well in.'</p>
<p>This answer so confused poor Alice, that she let the Dormouse go on for some time without interrupting it.</p>
</Chapter>
```

Output:

```xml
<Chapter id="1">
<p><Alice talking="true"/>'But they were <em>in</em> the well,' <Alice>Alice</Alice> said to the <Dormouse>Dormouse</Dormouse>, not choosing to notice this last remark.</p>
<p><Dormouse talking="true"/>'Of course they were', said the <Dormouse>Dormouse</Dormouse>; '—well in.'</p>
<p>This answer so confused poor <Alice>Alice</Alice>, that she let the <Dormouse>Dormouse</Dormouse> go on for some time without interrupting it.</p>
</Chapter>
```

## Important notes

Please make sure the text of the book stays exactly the same. It can contain archaic words, it should stay that way as it is a historic document.

**CRITICAL STRUCTURE PRESERVATION:**

- Each line in the original text must remain as a separate paragraph element
- Do not combine multiple lines into single paragraphs
- Preserve all line breaks and paragraph structure exactly as in the original

## Input

### Characters

<CharactersMaster>
{{characters}}
</CharactersMaster>

### Paragraphs

{{paragraphs}}

## CRUCIAL REQUIREMENT

MAKE SURE THE TEXT STAYS AS IS, EVEN IF IT HAS GRAMMAR MISTAKES OR WRONG CHARACTERS. OTHERWISE IT WON'T PASS THE EQUALITY CHECK AND THE EDITOR WILL BE IN TROUBLE.
THE ONLY THING THAT CAN DIFFER BETWEEN THE INPUT AND OUTPUT ARE THE ADDITIONAL TAGS AND ATTRIBUTES.

**PRESERVE THE ORIGINAL PARAGRAPH STRUCTURE EXACTLY.**
