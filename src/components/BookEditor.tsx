import React, { useState } from "react";
import PageEditor from "./PageEditor";
import { EntityDefinition } from "../utils/pageMetadataEditor";
import "../styles/BookEditor.css";

// Sample predefined characters
const PREDEFINED_CHARACTERS: EntityDefinition[] = [
  { name: "Alice", imageUrl: "https://example.com/alice.jpg" },
  { name: "Bob", imageUrl: "https://example.com/bob.jpg" },
  { name: "Charlie", imageUrl: "https://example.com/charlie.jpg" },
  { name: "Diana", imageUrl: "https://example.com/diana.jpg" },
];

const BookEditor: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);

  const handlePageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value);
    if (!isNaN(page) && page > 0) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="book-editor-container">
      <header className="editor-header">
        <h1>Book Editor</h1>
        <div className="page-navigation">
          <button onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1}>
            Previous Page
          </button>
          <input type="number" value={currentPage} onChange={handlePageChange} min={1} />
          <button onClick={() => setCurrentPage((prev) => prev + 1)}>Next Page</button>
        </div>
      </header>

      <main>
        <PageEditor pageNumber={currentPage} predefinedCharacters={PREDEFINED_CHARACTERS} />
      </main>
    </div>
  );
};

export default BookEditor;
