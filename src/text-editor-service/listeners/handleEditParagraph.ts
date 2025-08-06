export const handleEditParagraph = async (chapterNumber: number, paragraphNumber: number, bookName?: string) => {
  // This function will still trigger the API, but now the API will also trigger the SSE event
  // and open the external app on port 5174
  await fetch(`http://localhost:3000/api/text-editor/edit-paragraph`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapterNumber, paragraphNumber, bookName }),
  });
};
