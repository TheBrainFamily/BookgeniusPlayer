export function pageWasJustReloaded(): boolean {
  const howLongToUseOffsetAfterReload = 3000;
  const millisecondsSinceLoad = performance.now();
  const pageWasJustReloaded = millisecondsSinceLoad < howLongToUseOffsetAfterReload;
  return pageWasJustReloaded;
}
