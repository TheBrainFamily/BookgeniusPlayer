export const handleEditSentence = async (sentenceId: string) => {
  await fetch(`http://localhost:3000/api/text-editor/edit-sentence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentenceId }) });
};
