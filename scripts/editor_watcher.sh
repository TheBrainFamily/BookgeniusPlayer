#!/bin/bash

# odpalic to za pierwszym razem
# a potem watch'owac na xml (zmiana edytora itd)
# odpalic z juz czyms w stylu VITE_BOOK przekazanym sluga wezmiemy z .xml
fswatch -0 src/data | while IFS= read -r -d '' file; do
  case "$file" in
    *.xml)
      filename=$(basename "$file")
      book="${filename%.xml}"
      book="${book#chapters-}"
      book="${book%-chapters}"
      echo "File $filename changed, running scripts for $book..."
      VITE_BOOK="$book" bun src/data/xmlToReact.ts
      VITE_BOOK="$book" bun src/data/tools/create-book-metadata.ts
      echo "Scripts executed successfully for $book.";;
  esac
done


## Efektem tego pliku sa te dwa pliku w data ktore odpowiadaja za informacje kto jest w ktorym paragrafie i tekst ksiazki