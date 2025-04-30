#!/bin/bash

fswatch -o src/data/chapters.xml | while read num; do
  echo "File changed, running scripts..."
  bun src/data/xmlToComplexHtml.ts
  bun src/data/tools/get-character-tags-per-xml.ts
  echo "Scripts executed successfully."
done
