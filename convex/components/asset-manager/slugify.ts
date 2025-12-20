export const slugify = (name: string) =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // collapse non-alnum to "-"
    .replace(/^-+|-+$/g, "") || // trim leading/trailing "-"
  "item"; /* fallback if everything stripped*/
