# Check Character Assets

This script checks both asset completeness and dimensions for character assets in books.

## Asset Requirements:

- **MP4 files** (`character-name-speaks.mp4`, `character-name-listens.mp4`): Should be 480x480
- **PNG files** (`character-name.png`):
  - If there's a corresponding `character-name-listens.mp4`: Should be 256x256 or 200x200
  - If no `character-name-listens.mp4`: Should be 480x480

## Loop without some books:

```bash
for d in public_books/*/ ; do
  case "$d" in
    public_books/Lalka/|public_books/Fatherland/) continue ;;
  esac
  tsx ./scripts/check-character-assets.ts "$d" 2>/dev/null
done
```

## Loop without some books and ignore people that speak/listen less than 4 times

```bash
for d in public_books/*/ ; do
  case "$d" in
    public_books/Lalka/|public_books/Fatherland/) continue ;;
  esac
  tsx ./scripts/check-character-assets.ts "$d" 4 4 2>/dev/null
done
```

## One liner to just go over all the books and show all missing files, even if someone listens or speaks once

```bash
for d in public_books/*/; do tsx ./scripts/check-character-assets.ts "$d" 2> /dev/null ; done
```
