import { useChangesStore } from "../stores/changesStore";
import { useBooksStore } from "../stores/booksStore";
import { navigateToChangesView } from "../utils/updateUrlView";

export const UnsavedChangesIndicator = () => {
  const { currentBook } = useBooksStore();
  const { hasUnsavedChanges, getUnsavedCount } = useChangesStore();

  if (!currentBook || !hasUnsavedChanges(currentBook)) {
    return null;
  }

  const count = getUnsavedCount(currentBook);

  return (
    <div className="unsaved-changes-indicator" onClick={() => navigateToChangesView()}>
      <span className="changes-dot"></span>
      <span className="changes-text">
        {count} unsaved change{count > 1 ? 's' : ''}
      </span>
    </div>
  );
};