export const handleRemoveCharacter = async (target: HTMLElement, chapterNumber: number, paragraphNumber: number, characterName: string) => {
  const paragraph = target.closest("p");

  if (paragraph && characterName) {
    const characterOccurrences = paragraph.querySelectorAll(`span[data-character="${characterName}"]`);

    const occurrencesArray = Array.from(characterOccurrences);
    const currentIndex = occurrencesArray.indexOf(target);

    await fetch(`http://localhost:3000/api/text-editor/remove-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber, paragraphNumber, characterName, occurrenceNumber: currentIndex + 1 }),
    });
  }
};
