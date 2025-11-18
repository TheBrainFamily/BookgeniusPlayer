import { xmlToComplexHtml } from "./xmlToComplexHtml";

test("", () => {
  const bookString = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook id="demo-single-source" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xi="http://www.w3.org/2001/XInclude" xsi:noNamespaceSchemaLocation="ebook.xsd">

<CharactersMaster>
    <Xavier-March display="Xavier March" summary="A homicide investigator with the Berlin Kriminalpolizei (Kripo)."/>
    <Ratka display="Ratka" summary="An Unterwachtmeister (junior officer) in the Ordnungspolizei (Orpo) on patrol at Lake Havel."/>
    <Adolf-Hitler display="Adolf Hitler" summary="The Fuhrer of the Greater German Reich."/>
  </CharactersMaster>

  <BookMetadata>
    <Slug>Fatherland</Slug>
    <Title>Fatherland</Title> 
    <Author>Robert Harris</Author>
    <Language>English</Language>
    <Form>Mixed</Form>
  </BookMetadata>

<Chapter id="1">
<h3>TWO</h3>
<p>Thick cloud had pressed down on Berlin all night …</p>
<p>Sky and water merged into a sheet of grey …</p>
<p>It was a tough day. <Xavier-March>Xavier March</Xavier-March>, homicide investigator …</p>
<p><Ratka talking="true"/>'Heil <Adolf-Hitler>Hitler</Adolf-Hitler>!'</p>
<p><Xavier-March>March</Xavier-March> ignored him and slithered down …</p>
<p>It was an old man's body …</p>
<p><Xavier-March talking="true"/>'Your name, Unterwachtmeister?' <Xavier-March>March</Xavier-March> had a soft voice. Without taking his eyes off the body, he addressed the Orpo man who had saluted.</p>
<p><Ratka talking="true"/>'<Ratka>Ratka</Ratka>, Herr Sturmbannfuhrer.'</p>
<p><em>He answered quickly.</em></p>
<p><Xavier-March talking="true"/>'Well, <Ratka>Ratka</Ratka>,' said <Xavier-March>March</Xavier-March>, in that soft voice again, 'what time was he discovered?'</p>
</Chapter>
</ebook>`;

  const treatedAsBookString = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook id="demo-single-source" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xi="http://www.w3.org/2001/XInclude" xsi:noNamespaceSchemaLocation="ebook.xsd">

<CharactersMaster>
    <Xavier-March display="Xavier March" summary="A homicide investigator with the Berlin Kriminalpolizei (Kripo)."/>
    <Ratka display="Ratka" summary="An Unterwachtmeister (junior officer) in the Ordnungspolizei (Orpo) on patrol at Lake Havel."/>
    <Adolf-Hitler display="Adolf Hitler" summary="The Fuhrer of the Greater German Reich."/>
  </CharactersMaster>

  <BookMetadata>
    <Slug>Fatherland</Slug>
    <Title>Fatherland</Title> 
    <Author>Robert Harris</Author>
    <Language>English</Language>
    <Form>Play</Form>
  </BookMetadata>

<Chapter id="1">
<h3>TWO</h3>
<p><Narrator talking="true"/><strong>Narrator</strong></p>
<p>Thick cloud had pressed down on Berlin all night …</p>
<p>Sky and water merged into a sheet of grey …</p>
<p>It was a tough day. <Xavier-March>Xavier March</Xavier-March>, homicide investigator …</p>
<p><Ratka talking="true"/><strong>Ratka</strong></p>
<p>'Heil <Adolf-Hitler>Hitler</Adolf-Hitler>!'</p>
<p><Narrator talking="true"/><strong>Narrator</strong></p>
<p><Xavier-March>March</Xavier-March> ignored him and slithered down …</p>
<p>It was an old man's body …</p>
<p><Xavier-March talking="true"/><strong>Xavier March</strong></p>
<p>'Your name, Unterwachtmeister?' <Xavier-March>March</Xavier-March> had a soft voice. Without taking his eyes off the body, he addressed the Orpo man who had saluted.</p>
<p><Ratka talking="true"/><strong>Ratka</strong></p>
<p>'<Ratka>Ratka</Ratka>, Herr Sturmbannfuhrer.'</p>
<p><em>He answered quickly.</em></p>
<p><Xavier-March talking="true"/><strong>Xavier March</strong></p>
<p>'Well, <Ratka>Ratka</Ratka>,' said <Xavier-March>March</Xavier-March>, in that soft voice again, 'what time was he discovered?'</p>
</Chapter>
</ebook>`;

  const mixedHtml = xmlToComplexHtml(bookString, "example", "english").htmlResult;
  const playHtml = xmlToComplexHtml(treatedAsBookString, "example", "english").htmlResult;

  const normalize = (html: string) => html.replace(/\s*data-index="\d+"/g, "");

  expect(normalize(mixedHtml).replace("play-container mixed-container", "play-container")).toBe(normalize(playHtml));
});
