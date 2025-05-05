#!/bin/bash

fswatch -o src/data/chapters-1984.xml | while read num; do ## ZMIENIAMY ZE WSZYSTKIE CHAPTERY
  echo "File changed, running scripts..."
  # Command to process includes and save to a new file
  # xmllint --xinclude src/data/chapter-1.xml > src/data/chapter-1-resolved.tmp.xml

# # Or, if you want to validate against the schema at the same time
# # (xmllint processes includes *before* validation)
# xmllint --xinclude --schema ebook.xsd ebook.xml --output ebook_resolved.xml

  bun src/data/xmlToComplexHtml.ts ## To generuje ./src/data/chapters.ts
  bun src/data/tools/get-character-tags-per-xml.ts  ## To generuje ./src/data/metadata.ts
  echo "Scripts executed successfully."
done


## Efektem tego pliku sa te dwa pliku w data ktore odpowiadaja za informacje kto jest w ktorym paragrafie i tekst ksiazki