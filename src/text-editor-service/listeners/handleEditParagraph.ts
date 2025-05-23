export const handleEditParagraph = async (chapterNumber: number, paragraphNumber: number) => {
  await fetch(`http://localhost:3000/api/text-editor/edit-paragraph`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapterNumber, paragraphNumber }),
  });
};
