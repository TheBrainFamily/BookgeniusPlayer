import "dotenv/config";
export const getBookForm = () => process.env.BOOK_FORM || "play";
