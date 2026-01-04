import { readBookFile } from "./readBookFile";
import type { BookSettings } from "./createBookSettings";
import { FILE_TYPE } from "./filesHelpers";

export function getBookSettings(): BookSettings {
  const settings = JSON.parse(readBookFile("bookSettings.json", FILE_TYPE.TEMPORARY)) as BookSettings;
  return settings;
}
