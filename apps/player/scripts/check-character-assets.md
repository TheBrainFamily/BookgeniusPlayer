# Check Character Assets

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
