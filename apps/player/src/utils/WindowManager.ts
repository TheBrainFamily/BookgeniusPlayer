export class WindowManager {
  private targetWindow: Window | null = null;

  openOrUpdateApp(bookName: string, chapterNumber: number): Window | null {
    const url = `http://localhost:5174?book=${bookName}&chapter=chapter${chapterNumber}.xml`;

    // Check if we have a reference to the window and if it's still open
    if (this.targetWindow && !this.targetWindow.closed) {
      console.log(`Updating existing window with book: ${bookName}, chapter: ${chapterNumber}`);

      // Try to update the URL
      try {
        // Navigate to the new URL with updated params
        this.targetWindow.location.href = url;
        this.targetWindow.focus();
        return this.targetWindow;
      } catch (error) {
        // If we can't access the window (cross-origin), we'll need to open a new one
        console.warn("Cannot update window URL due to cross-origin restrictions:", error);
        this.targetWindow = null;
      }
    }

    // If no existing window or couldn't update it, open a new one
    console.log(`Opening new window with book: ${bookName}, chapter: ${chapterNumber}`);

    // Use a fixed window name to ensure browsers treat it as the same window
    this.targetWindow = window.open(url, "BookGeniusEditor");

    if (this.targetWindow) {
      // Try to focus the window
      this.targetWindow.focus();
    }

    return this.targetWindow;
  }

  // Method to check if the editor window is open
  isEditorOpen(): boolean {
    return this.targetWindow !== null && !this.targetWindow.closed;
  }

  // Method to close the editor window
  closeEditor(): void {
    if (this.targetWindow && !this.targetWindow.closed) {
      this.targetWindow.close();
      this.targetWindow = null;
    }
  }
}
