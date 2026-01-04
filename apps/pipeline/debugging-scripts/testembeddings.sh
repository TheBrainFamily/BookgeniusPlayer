SEARCH='Alice with White Rabbit'
FILTER='{"chapterFrom":0,"chapterTo":3,"paragraphTo":8,"bookSlug":"alice-wonderland"}'

curl -vvv -G 'https://alice.bookgenius.net/api/getParagraphsForSearch' \
     --data-urlencode "searchQuery=${SEARCH}" \
     --data-urlencode "filter=${FILTER}"


QUESTION='What is the name of the rabbit?'

curl -vvv -G 'https://alice.bookgenius.net/api/deepResearch' \
     --data-urlencode "question=${QUESTION}" \
     --data-urlencode "filter=${FILTER}"


