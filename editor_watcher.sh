#!/bin/bash

fswatch -o src/data/chapters.xml | while read num; do ## ZMIENIAMY ZE WSZYSTKIE CHAPTERY
  echo "File changed, running scripts..."
  bun src/data/xmlToComplexHtml.ts ## To generuje ./src/data/chapters.ts
  bun src/data/tools/get-character-tags-per-xml.ts  ## To generuje ./src/data/metadata.ts
  echo "Scripts executed successfully."
done


## Efektem tego pliku sa te dwa pliku w data ktore odpowiadaja za informacje kto jest w ktorym paragrafie i tekst ksiazki