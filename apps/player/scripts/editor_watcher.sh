#!/bin/bash

fswatch -0 scripts/data | while IFS= read -r -d '' file; do
  case "$file" in
    *.xml)
      filename=$(basename "$file")
      book="${filename%.xml}"
      book="${book#chapters-}"
      book="${book%-chapters}"
      echo "File $filename changed, running scripts for $book..."
      VITE_BOOK="$book" bun scripts/data/xmlToComplexHtml.ts
      VITE_BOOK="$book" bun scripts/data/create-book-metadata.ts
      echo "Scripts executed successfully for $book.";;
  esac
done


## Efektem tego pliku sa te dwa pliku w data ktore odpowiadaja za informacje kto jest w ktorym paragrafie i tekst ksiazki