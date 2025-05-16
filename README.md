# Book Genius Frontend


## How to run the frontend:


```
pnpm install && yarn dev
```

To select a book:
```
VITE_BOOK=1984 yarn dev
```
or:
```
VITE_BOOK=Pharaon yarn dev
```


## Preparing audiobook:

1. Download daisy files
2. run ```bun src/convertSmilToAudiobookItems.ts ```
3. check if chapters and paragraphs match book Xml
4. create a AudiobookTracksDefined file in public_books/{BOOK_SLUG}/audiobook_data 
5. import AudiobookTracksDefined you just created and assert it so it has unique name in getAudiobookTracksForBook
6. (optional) if audio has some long intro you can map the paragraphs accordingly