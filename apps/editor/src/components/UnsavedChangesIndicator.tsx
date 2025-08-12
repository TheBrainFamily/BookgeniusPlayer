import { useChangesStore } from "../stores/changesStore";
import { navigateToChangesView } from "../utils/updateUrlView";

export const UnsavedChangesIndicator = () => {
  const { getAllChanges } = useChangesStore();
  
  const allChanges = getAllChanges();
  const count = allChanges.length;

  if (count === 0) {
    return null;
  }

  // Group by books for display
  const bookGroups = allChanges.reduce((acc, change) => {
    if (!acc[change.bookName]) acc[change.bookName] = 0;
    acc[change.bookName]++;
    return acc;
  }, {} as Record<string, number>);

  const bookCount = Object.keys(bookGroups).length;
  
  const displayText = bookCount === 1 
    ? `${count} unsaved change${count > 1 ? 's' : ''}` 
    : `${count} unsaved changes (${bookCount} books)`;

  return (
    <div className="unsaved-changes-indicator" onClick={() => navigateToChangesView()}>
      <span className="changes-dot"></span>
      <span className="changes-text">
        {displayText}
      </span>
    </div>
  );
};