import { getPageMetadata } from "../fetchers/getPageMetadata";
import { updatePageMetadata } from "../fetchers/updatePageMetadata";
import { IEntityNote, IPageMetadata } from "../fetchers/PageMetadata";

export type EntityDefinition = { name: string; imageUrl: string };

/**
 * Updates a page's context summary
 * @param pageNumber Page number to update
 * @param contextSummary New context/summary for the page
 */
export async function updatePageContext(pageNumber: number, contextSummary: string): Promise<boolean> {
  try {
    const pageData = await getPageMetadata(pageNumber);
    if (!pageData) return false;

    const updatedMetadata: IPageMetadata = { ...pageData.metadata, contextForPage: contextSummary };

    await updatePageMetadata(pageNumber, updatedMetadata);
    return true;
  } catch (error) {
    console.error("Failed to update page context:", error);
    return false;
  }
}

/**
 * Updates a chapter summary for a page
 * @param pageNumber Page number to update
 * @param chapterSummary New chapter summary
 */
export async function updateChapterSummary(pageNumber: number, chapterSummary: string): Promise<boolean> {
  try {
    const pageData = await getPageMetadata(pageNumber);
    if (!pageData) return false;

    const updatedMetadata: IPageMetadata = { ...pageData.metadata, chapterSummary };

    await updatePageMetadata(pageNumber, updatedMetadata);
    return true;
  } catch (error) {
    console.error("Failed to update chapter summary:", error);
    return false;
  }
}

/**
 * Adds a new character/entity note to a page
 * @param pageNumber Page number to update
 * @param entityNote New entity note to add
 * @param entityDefinition Optional entity definition with canonical name and image
 */
export async function addEntityNote(pageNumber: number, entityNote: Partial<IEntityNote>, entityDefinition?: EntityDefinition): Promise<boolean> {
  try {
    const pageData = await getPageMetadata(pageNumber);
    if (!pageData) return false;

    // Create a complete entity note using the provided data and entity definition
    const completeEntityNote: IEntityNote = {
      entity: entityNote.entity || "",
      mentionedAs: entityNote.mentionedAs || entityNote.entity || "",
      canonicalName: entityNote.canonicalName || entityDefinition?.name || "",
      summary: entityNote.summary || "",
      longerSummary: entityNote.longerSummary || "",
      imageUrl: entityNote.imageUrl || entityDefinition?.imageUrl,
      fullSentence: entityNote.fullSentence || "",
      lastSeenPage: entityNote.lastSeenPage || pageNumber,
      lastSeenContext: entityNote.lastSeenContext || null,
      isFirstAppearance: entityNote.isFirstAppearance !== undefined ? entityNote.isFirstAppearance : true,
      alternativeSummary: entityNote.alternativeSummary || "",
      introSummary: entityNote.introSummary || "",
    };

    const updatedMetadata: IPageMetadata = { ...pageData.metadata, notesForPage: [...pageData.metadata.notesForPage, completeEntityNote] };

    await updatePageMetadata(pageNumber, updatedMetadata);
    return true;
  } catch (error) {
    console.error("Failed to add entity note:", error);
    return false;
  }
}

/**
 * Updates an existing entity note for a character on a page
 * @param pageNumber Page number to update
 * @param entityName Name of the entity to update
 * @param updatedFields Fields to update for the entity
 */
export async function updateEntityNote(pageNumber: number, entityName: string, updatedFields: Partial<IEntityNote>): Promise<boolean> {
  try {
    const pageData = await getPageMetadata(pageNumber);
    if (!pageData) return false;

    const updatedNotes = pageData.metadata.notesForPage.map((note) => {
      // If this is the entity we want to update
      if (note.canonicalName === entityName || note.entity === entityName) {
        return { ...note, ...updatedFields };
      }
      return note;
    });

    const updatedMetadata: IPageMetadata = { ...pageData.metadata, notesForPage: updatedNotes };

    await updatePageMetadata(pageNumber, updatedMetadata);
    return true;
  } catch (error) {
    console.error(`Failed to update entity note for "${entityName}":`, error);
    return false;
  }
}

/**
 * Removes an entity note from a page
 * @param pageNumber Page number to update
 * @param entityName Name of the entity to remove
 */
export async function removeEntityNote(pageNumber: number, entityName: string): Promise<boolean> {
  try {
    const pageData = await getPageMetadata(pageNumber);
    if (!pageData) return false;

    const updatedNotes = pageData.metadata.notesForPage.filter((note) => note.canonicalName !== entityName && note.entity !== entityName);

    const updatedMetadata: IPageMetadata = { ...pageData.metadata, notesForPage: updatedNotes };

    await updatePageMetadata(pageNumber, updatedMetadata);
    return true;
  } catch (error) {
    console.error(`Failed to remove entity note for "${entityName}":`, error);
    return false;
  }
}

/**
 * Gets all entity notes for a specific page
 * @param pageNumber Page number to get entities for
 */
export async function getPageEntityNotes(pageNumber: number): Promise<IEntityNote[] | null> {
  try {
    const pageData = await getPageMetadata(pageNumber);
    if (!pageData) return null;

    return pageData.metadata.notesForPage;
  } catch (error) {
    console.error("Failed to get entity notes:", error);
    return null;
  }
}

/**
 * Updates the entire page metadata at once
 * @param pageNumber Page number to update
 * @param metadata Complete metadata object to use
 */
export async function updateFullPageMetadata(pageNumber: number, metadata: IPageMetadata): Promise<boolean> {
  try {
    await updatePageMetadata(pageNumber, metadata);
    return true;
  } catch (error) {
    console.error("Failed to update full page metadata:", error);
    return false;
  }
}
