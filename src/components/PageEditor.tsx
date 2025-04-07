import React, { useState, useEffect } from "react";
import { IEntityNote, IPageMetadata } from "../fetchers/PageMetadata";
import { getPageMetadata } from "../fetchers/getPageMetadata";
import { updatePageContext, updateChapterSummary, addEntityNote, updateEntityNote, removeEntityNote, EntityDefinition } from "../utils/pageMetadataEditor";
import "../styles/PageEditor.css";

interface PageEditorProps {
  pageNumber: number;
  predefinedCharacters?: EntityDefinition[];
}

const PageEditor: React.FC<PageEditorProps> = ({ pageNumber, predefinedCharacters = [] }) => {
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<IPageMetadata | null>(null);
  const [pageContext, setPageContext] = useState("");
  const [chapterSummary, setChapterSummary] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState<string>("");
  const [characterSummary, setCharacterSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Fetch page data when the page number changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const data = await getPageMetadata(pageNumber);
      if (data) {
        setPageData(data.metadata);
        setPageContext(data.metadata.contextForPage);
        setChapterSummary(data.metadata.chapterSummary);
      }
      setLoading(false);
    };

    fetchData();
  }, [pageNumber]);

  // Handle updating page context
  const handleUpdateContext = async () => {
    if (!pageData) return;

    setSaving(true);
    setMessage("");

    const success = await updatePageContext(pageNumber, pageContext);

    if (success) {
      setMessage("Page context updated successfully");
    } else {
      setMessage("Failed to update page context");
    }

    setSaving(false);
  };

  // Handle updating chapter summary
  const handleUpdateChapterSummary = async () => {
    if (!pageData) return;

    setSaving(true);
    setMessage("");

    const success = await updateChapterSummary(pageNumber, chapterSummary);

    if (success) {
      setMessage("Chapter summary updated successfully");
    } else {
      setMessage("Failed to update chapter summary");
    }

    setSaving(false);
  };

  // Handle updating character info
  const handleUpdateCharacter = async () => {
    if (!pageData || !selectedCharacter) return;

    setSaving(true);
    setMessage("");

    const success = await updateEntityNote(pageNumber, selectedCharacter, { summary: characterSummary });

    if (success) {
      setMessage(`Character "${selectedCharacter}" updated successfully`);
      // Refresh page data
      const newData = await getPageMetadata(pageNumber);
      if (newData) {
        setPageData(newData.metadata);
      }
    } else {
      setMessage(`Failed to update character "${selectedCharacter}"`);
    }

    setSaving(false);
  };

  // Handle adding a new character
  const handleAddCharacter = async (entityDef: EntityDefinition) => {
    if (!pageData) return;

    setSaving(true);
    setMessage("");

    const newEntity: Partial<IEntityNote> = { entity: entityDef.name, canonicalName: entityDef.name, summary: "New character", imageUrl: entityDef.imageUrl };

    const success = await addEntityNote(pageNumber, newEntity);

    if (success) {
      setMessage(`Character "${entityDef.name}" added successfully`);
      // Refresh page data
      const newData = await getPageMetadata(pageNumber);
      if (newData) {
        setPageData(newData.metadata);
      }
    } else {
      setMessage(`Failed to add character "${entityDef.name}"`);
    }

    setSaving(false);
  };

  // Handle removing a character
  const handleRemoveCharacter = async (characterName: string) => {
    if (!pageData) return;

    setSaving(true);
    setMessage("");

    const success = await removeEntityNote(pageNumber, characterName);

    if (success) {
      setMessage(`Character "${characterName}" removed successfully`);
      setSelectedCharacter("");
      setCharacterSummary("");
      // Refresh page data
      const newData = await getPageMetadata(pageNumber);
      if (newData) {
        setPageData(newData.metadata);
      }
    } else {
      setMessage(`Failed to remove character "${characterName}"`);
    }

    setSaving(false);
  };

  if (loading) {
    return <div>Loading page data...</div>;
  }

  if (!pageData) {
    return <div>Error loading page data</div>;
  }

  return (
    <div className="page-editor">
      <h2>Page {pageNumber} Editor</h2>

      {message && <div className={message.includes("Failed") ? "error-message" : "success-message"}>{message}</div>}

      <section className="editor-section">
        <h3>Page Context</h3>
        <textarea value={pageContext} onChange={(e) => setPageContext(e.target.value)} rows={5} placeholder="Enter page context/summary" />
        <button onClick={handleUpdateContext} disabled={saving}>
          {saving ? "Saving..." : "Save Page Context"}
        </button>
      </section>

      <section className="editor-section">
        <h3>Chapter Summary</h3>
        <textarea value={chapterSummary} onChange={(e) => setChapterSummary(e.target.value)} rows={5} placeholder="Enter chapter summary" />
        <button onClick={handleUpdateChapterSummary} disabled={saving}>
          {saving ? "Saving..." : "Save Chapter Summary"}
        </button>
      </section>

      <section className="editor-section">
        <h3>Character Notes</h3>
        {pageData.notesForPage.length > 0 ? (
          <div className="character-list">
            <select
              value={selectedCharacter}
              onChange={(e) => {
                setSelectedCharacter(e.target.value);
                const character = pageData.notesForPage.find((note) => note.canonicalName === e.target.value);
                if (character) {
                  setCharacterSummary(character.summary);
                }
              }}
            >
              <option value="">Select a character</option>
              {pageData.notesForPage.map((note) => (
                <option key={note.canonicalName} value={note.canonicalName}>
                  {note.canonicalName}
                </option>
              ))}
            </select>

            {selectedCharacter && (
              <>
                <textarea value={characterSummary} onChange={(e) => setCharacterSummary(e.target.value)} rows={4} placeholder="Enter character summary" />
                <div className="button-group">
                  <button onClick={handleUpdateCharacter} disabled={saving}>
                    {saving ? "Saving..." : "Update Character"}
                  </button>
                  <button onClick={() => handleRemoveCharacter(selectedCharacter)} disabled={saving} className="remove-button">
                    Remove Character
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <p>No character notes for this page yet.</p>
        )}
      </section>

      <section className="editor-section">
        <h3>Add Character from Predefined List</h3>
        <div className="predefined-characters">
          {predefinedCharacters.length > 0 ? (
            predefinedCharacters.map((character) => (
              <div key={character.name} className="character-card">
                {character.imageUrl && <img src={character.imageUrl} alt={character.name} className="character-image" />}
                <span>{character.name}</span>
                <button onClick={() => handleAddCharacter(character)} disabled={saving}>
                  Add to Page
                </button>
              </div>
            ))
          ) : (
            <p>No predefined characters available.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default PageEditor;
