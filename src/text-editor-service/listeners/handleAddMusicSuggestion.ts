export const handleAddMusicSuggestion = async (chapterNumber: number, paragraphNumber: number) => {
  await fetch(`http://localhost:3000/api/text-editor/add-music-suggestion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapterNumber, paragraphNumber }),
  });
};
