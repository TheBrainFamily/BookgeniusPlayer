import { useState } from "react";
import { useBooksStore } from "../stores/booksStore.ts";
import { useChangesStore } from "../stores/changesStore.ts";
import { updateUrlChapter } from "../utils/updateUrlChapter.ts";
import { updateUrlBook } from "../utils/updateUrlBook.ts";
import bookgeniusLogoEditor from "../assets/bookgenius-editor.svg";
import { useAppStore } from "../stores/appStore.ts";

export const Sidebar = () => {
  const { books, setCurrentBook, currentBook, chapters, setCurrentFile, currentFile, characters } = useBooksStore();
  const { setSelectedSpan } = useAppStore();
  const { hasUnsavedChanges } = useChangesStore();
  const [isChaptersExpanded, setIsChaptersExpanded] = useState(true);
  const [isCharactersExpanded, setIsCharactersExpanded] = useState(true);

  const handleBookChange = (newBook: string) => {
    setCurrentBook(newBook);
    updateUrlBook(newBook);
    setCurrentFile("chapter1");
    updateUrlChapter("chapter1");
    setSelectedSpan(null, null);
  };

  return (
    <div className="sidebar">
      <div className="logo">
        <img src={bookgeniusLogoEditor} alt="bookgenius-logo-editor" />
      </div>
      <div style={{ marginBottom: "15px" }}>
        <label htmlFor="book-selector" style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
          Book:
        </label>
        <select
          id="book-selector"
          value={currentBook}
          onChange={(e) => handleBookChange(e.target.value)}
          style={{ width: "100%", padding: "5px", fontSize: "14px", backgroundColor: "#1e1e1e", color: "#cccccc", border: "1px solid #3c3c3c", borderRadius: "3px" }}
        >
          {books.map((book) => (
            <option key={book} value={book}>
              {book}
            </option>
          ))}
        </select>
      </div>
      <div className="collapsible-section">
        <div className="section-header" onClick={() => setIsChaptersExpanded(!isChaptersExpanded)}>
          <span className={`dropdown-icon ${isChaptersExpanded ? "expanded" : ""}`}>▶</span>
          <h3>Chapters</h3>
        </div>
        {isChaptersExpanded && (
          <ul className="section-content">
            {Object.keys(chapters).map((chapter) => (
              <li
                key={chapter}
                className={`file-item ${currentFile === chapter ? "active" : ""}`}
                onClick={() => {
                  setCurrentFile(chapter);
                  updateUrlChapter(chapter);
                }}
              >
                📄 {chapter}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="collapsible-section">
        <div className="section-header" onClick={() => setIsCharactersExpanded(!isCharactersExpanded)}>
          <span className={`dropdown-icon ${isCharactersExpanded ? "expanded" : ""}`}>▶</span>
          <h3>Characters</h3>
        </div>
        {isCharactersExpanded && (
          <ul className="section-content">
            {characters.map((character) => (
              <li key={character.tag} className="character-item">
                <strong>{character.tag}</strong>
                <div className="character-display">{character.name}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
