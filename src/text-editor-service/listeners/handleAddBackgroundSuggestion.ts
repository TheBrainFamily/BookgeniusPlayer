export const handleAddBackgroundSuggestion = async (chapterNumber: number, paragraphNumber: number) => {
  await fetch(`http://localhost:3000/api/text-editor/add-background-suggestion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapterNumber, paragraphNumber }),
  });
};
