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

**Example for plays - CRITICAL STRUCTURE PRESERVATION:**

Input: 
```xml
<p><strong>THESEUS</strong></p>
<p>Now, fair Hippolyta, our nuptial hour</p>
<p>Draws on apace; four happy days bring in</p>
<p>Another moon; but oh, methinks, how slow</p>
<p>This old moon wanes! She lingers my desires,</p>
<p>Like to a step-dame or a dowager,</p>
<p>Long withering out a young man's revenue.</p>
<p><strong>HIPPOLYTA</strong></p>
<p>Four days will quickly steep themselves in night;</p>
<p>Four nights will quickly dream away the time;</p>
<p>And then the moon, like to a silver bow</p>
<p>New bent in heaven, shall behold the night</p>
<p>Of our solemnities.</p>
```

Output:
```xml
<p><Theseus talking="true"/><strong>THESEUS</strong></p>
<p>Now, fair <Hippolyta>Hippolyta</Hippolyta>, our nuptial hour</p>
<p>Draws on apace; four happy days bring in</p>
<p>Another moon; but oh, methinks, how slow</p>
<p>This old moon wanes! She lingers my desires,</p>
<p>Like to a step-dame or a dowager,</p>
<p>Long withering out a young man's revenue.</p>
<p><Hippolyta talking="true"/><strong>HIPPOLYTA</strong></p>
<p>Four days will quickly steep themselves in night;</p>
<p>Four nights will quickly dream away the time;</p>
<p>And then the moon, like to a silver bow</p>
<p>New bent in heaven, shall behold the night</p>
<p>Of our solemnities.</p>
```

**IMPORTANT: Each line must remain as a separate paragraph element. Do NOT combine multiple lines into single paragraphs like this:**

❌ WRONG:
```xml
<p>Now, fair <Hippolyta>Hippolyta</Hippolyta>, our nuptial hour Draws on apace; four happy days bring in Another moon; but oh, methinks, how slow This old moon wanes! She lingers my desires, Like to a step-dame or a dowager, Long withering out a young man's revenue.</p>
```

✅ CORRECT:
```xml
<p>Now, fair <Hippolyta>Hippolyta</Hippolyta>, our nuptial hour</p>
<p>Draws on apace; four happy days bring in</p>
<p>Another moon; but oh, methinks, how slow</p>
<p>This old moon wanes! She lingers my desires,</p>
<p>Like to a step-dame or a dowager,</p>
<p>Long withering out a young man's revenue.</p>
```

Another example for play.

Input: 
```xml
<p><strong>FRIAR LAURENCE</strong></p>
<p>Too familiar</p>
<p>Is my dear son with such sour company:</p>
<p>I bring thee tidings of the prince's doom.</p>
<p><strong>ROMEO</strong></p>
<p>What less than dooms-day is the prince's doom?</p>
<p><strong>FRIAR LAURENCE</strong></p>
<p>A gentler judgment vanish'd from his lips,</p>
<p>Not body's death, but body's banishment.</p>
<p><em>Exit Sergeant</em></p>
<p>Who comes here, Juliete?</p>
<p><em>Enter ROSS</em></p>
```

Output:
```xml
<p><Friar-Laurence talking="true"/><strong>FRIAR LAURENCE</strong></p>
<p>Too familiar</p>
<p>Is my dear son with such sour company:</p>
<p>I bring thee tidings of the prince's doom.</p>
<p><Romeo talking="true"/><strong>ROMEO</strong></p>
<p>What less than dooms-day is the prince's doom?</p>
<p><Friar-Laurence talking="true"/><strong>FRIAR LAURENCE</strong></p>
<p>A gentler judgment vanish'd from his lips,</p>
<p>Not body's death, but body's banishment.</p>
<p><em>Exit <Sergeant>Sergeant</Sergeant></em></p>
<p>Who comes here, <Juliete>Juliete</Juliete>?</p>
<p><em>Enter <Ross>ROSS</Ross></em></p>
```

So in the case of plays, we only want to add the talking to the paragraph that explicitly defines the person who is talking at that moment.
In all the other cases only mark the non-speaking references like this: <p>Who comes here, <Juliete>Juliete</Juliete>?</p>


Input:
```xml
<p><em>Enter Nurse and PETER</em></p>
<p>O honey nurse, what news?</p>
<p>Hast thou met with him? Send thy man away.</p>
<p><strong>Nurse</strong></p>
<p>Peter, stay at the gate.</p>
<p><em>Exit PETER</em></p>
<p><em>Re-enter PETER</em></p>
<p>O Romeo, Romeo, brave Mercutio's dead!</p>

```

Output:
```xml
<p><em>Enter <Nurse enters="true">Nurse</Nurse> and <Peter enters="true">PETER</Peter></em></p>
<p>O honey <Nurse>nurse</Nurse>, what news?</p>
<p>Hast thou met with him? Send thy man away.</p>
<p><Nurse talking="true"/><strong>Nurse</strong></p>
<p><Peter>Peter</Peter>, stay at the gate.</p>
<p><em>Exit <Peter exits="true">PETER</Peter></em></p>
<p><em>Re-enter <Peter enters="true">PETER</Peter></em></p>
<p>O <Romeo>Romeo</Romeo>, <Romeo>Romeo</Romeo>, brave <Mercutio>Mercutio's</Mercutio> dead!</p>
```

So in the case of plays, we want to add the enters and exits to the paragraph that explicitly defines the person who enters or exits at that moment.
The paragraphs are called stage directions, and they explicitly define who enters and who exits in the paragraph. They also can say that someone re-enters; it also means that some enters the paragraph. 

Another example for play paragraphs, where we want to mark characters which enters the paragraph while they're not mentioned by their name exactly

Input:
```xml
<p><em>Enter Prince, attended; MONTAGUE, CAPULET, their Wives, and others</em></p>
<p><strong>PRINCE</strong></p>
<p>Where are the vile beginners of this fray?</p>
```

Output:
```xml
<p><em>Enter <Prince-Escalus enters="true">Prince</Prince-Escalus>, attended; <Montague enters="true">MONTAGUE</Montague>, <Capulet enters="true">CAPULET</Capulet>, <Lady-Capulet enters="true"/> <Lady-Montague enters="true"/> their Wives, and others</em></p>
<p><Prince-Escalus talking="true"/><strong>PRINCE</strong></p>
<p>Where are the vile beginners of this fray?</p>
```

So in the case of plays, we want to add the characters tag to the paragraph that implicates their involvement like e.g `their Wives` which currently means that the wives of mentioned characters should be marked by their tag here. They should be separated by a white space.

Input:
```xml
<Chapter id="26"><h4>SCENE III. A churchyard; in it a tomb belonging to the Capulets.</h4>
<span><em>Enter PARIS, and his Page bearing flowers and a torch</em></span>
<p><strong>First Watchman</strong></p>
<p>[Within] Lead, boy: which way?</p>
<p><em>Re-enter some of the Watch, with BALTHASAR</em></p>
<p><strong>Second Watchman</strong></p>
<p>Here's Romeo's man; we found him in the churchyard.</p>
<p><em>Enter JULIET</em></p>
<p><strong>JULIET</strong></p>
```

Output:
```xml
<Chapter id="26"><h4>SCENE III. A churchyard; in it a tomb belonging to the Capulets.</h4>
<span><em>Enter <Paris enters="true">PARIS</Paris>, and his <Pariss-Page enters="true">Page</Pariss-Page> bearing flowers and a torch <First-Watchman enters="true"/>, <Second-Watchman enters="true"/></em></span>
<p><First-Watchman talking="true"/><strong>First Watchman</strong></p>
<p>[Within] Lead, boy: which way?</p>
<p><em>Re-enter some of the Watch, with BALTHASAR</em></p>
<p><Second-Watchman talking="true"/><strong>Second Watchman</strong></p>
<p>Here's Romeo's man; we found him in the churchyard.</p>
<p><em>Enter <Juliet enters="true">JULIET</Juliet></em></p>
<p><Juliet talking="true"/><strong>JULIET</strong></p>
```

So in the case of plays, characters should be mentioned in the closest stage directions if they speak in the scene and are not listed at the beginning of the scene. 
In other words, we include a character in the stage directions if they have lines in the scene and aren't listed at the scene's start. Unless they do not enter later in the scene. They should be separated by a comma.

Another example that describes the difference between a character and their entire family.

Input:
```xml
<span><em>Enter SAMPSON and GREGORY, of the house of Capulet, armed with swords and bucklers</em></span>
<p><strong>SAMPSON</strong></p>
<p>Gregory, o' my word, we'll not carry coals.</p>
<p><strong>GREGORY</strong></p>
<p>No, for then we should be colliers.</p>
```

Output:
```xml
<span><em>Enter <Sampson enters="true">SAMPSON</Sampson> and <Gregory enters="true">GREGORY</Gregory>, of the house of <Capulet dynasty="true">Capulet</Capulet>, armed with swords and bucklers</em></span>
<p><Sampson talking="true"/><strong>SAMPSON</strong></p>
<p><Gregory>Gregory</Gregory>, o' my word, we'll not carry coals.</p>
<p><Gregory talking="true"/><strong>GREGORY</strong></p>
<p>No, for then we should be colliers.</p>
```

In this example there is a `Capulet` in the stage direction which does not say about `Capulet` as a character, but as a `Capulet's Dynasty`. It should be marked as in the example.

Another case for play:

Input:
```xml
<Chapter id="26"><h4>SCENE III. A churchyard; in it a tomb belonging to the Capulets.</h4>
<span><em>Enter PARIS, and his Page bearing flowers and a torch</em></span>
<p><strong>SAMPSON</strong></p>
<p>Gregory, o' my word, we'll not carry coals.</p>
<p><strong>GREGORY</strong></p>
<p>No, for then we should be colliers.</p>
<p><strong>Montague</strong></p>
<p>I am here to help you</p>
<p><em>Exeunt all but <Montague>MONTAGUE</Montague>, <Lady-Montague>LADY MONTAGUE</Lady-Montague>, and <Benvolio>BENVOLIO</Benvolio></em></p>
```

Output:
```xml
<Chapter id="26"><h4>SCENE III. A churchyard; in it a tomb belonging to the Capulets.</h4>
<span><em>Enter <Paris enters="true">PARIS</Paris>, and his <Pariss-Page enters="true">Page</Pariss-Page> bearing flowers and a torch <First-Watchman enters="true"/></em></span>
<p><Sampson talking="true"/><strong>SAMPSON</strong></p>
<p>Gregory, o' my word, we'll not carry coals.</p>
<p><Gregory talking="true"/><strong>GREGORY</strong></p>
<p>No, for then we should be colliers.</p>
<p><Montague talking="true"/><strong>Montague</strong></p>
<p>I am here to help you</p>
<p><em>Exeunt all but <Montague>MONTAGUE</Montague>, <Lady-Montague>LADY MONTAGUE</Lady-Montague>, and <Benvolio>BENVOLIO</Benvolio> <Sampson exits="true" /> <Gregory exits="true" /> <First-Watchman exits="true"/> <Paris exits="true">PARIS</Paris> <Pariss-Page exits="true"/></em></p>
```

In this case when the stage direction says that all exits except for someone, we need to take a look from the beginning of the chapter and mark other as they really exit.


## Important notes

Please make sure the text of the book stays exactly the same. It can contain archaic words, it should stay that way as it is a historic document.

**CRITICAL STRUCTURE PRESERVATION:**
- Each line in the original text must remain as a separate paragraph element
- Do not combine multiple lines into single paragraphs
- Preserve all line breaks and paragraph structure exactly as in the original
- This is especially important for plays and poetry where line structure is crucial

## Input

### Characters

<CharactersMaster>
{{characters}}
</CharactersMaster>

### Paragraphs

{{paragraphs}}

## CRUCIAL REQUIREMENT

MAKE SURE THE TEXT STAYS AS IS, EVEN IF IT HAS GRAMMAR MISTAKES OR WRONG CHARACTERS. OTHERWISE IT WON'T PASS THE EQUALITY CHECK AND THE EDITOR WILL BE IN TROUBLE.
THE ONLY THING THAT CAN DIFFER BETWEEN THE INPUT AND OUTPUT ARE THE ADDITIONAL TAGS.

**PRESERVE THE ORIGINAL PARAGRAPH STRUCTURE EXACTLY. EACH LINE SHOULD REMAIN AS A SEPARATE PARAGRAPH ELEMENT.**
