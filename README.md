# Book Genius Frontend

## How to run the frontend:

```
pnpm install && yarn dev
```

To select a book (default Pharaon):

```
VITE_BOOK=1984 yarn dev
```

or:

```
VITE_BOOK=Pharaon yarn dev
```

To select language (default PL):

```
VITE_LANG=EN yarn dev
```

or

```
VITE_LANG=PL yarn dev
```

## Preparing audiobook:

1. Download daisy files
2. run `bun src/convertSmilToAudiobookItems.ts `
3. check if chapters and paragraphs match book Xml
4. create a AudiobookTracksDefined file in public_books/{BOOK_SLUG}/audiobook_data
5. import AudiobookTracksDefined you just created and assert it so it has unique name in getAudiobookTracksForBook
6. (optional) if audio has some long intro you can map the paragraphs accordingly

## How to run the frontend with editor mode:

```
VITE_BOOK=Krolowa-Sniegu VITE_EDITOR=true yarn dev
```

```
tsx src/text-editor-service/server.ts
```

### Additional Requirements

- installed VSCode
