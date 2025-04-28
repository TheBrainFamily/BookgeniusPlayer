import { BOOK_SLUGS } from "../consts";
import { pharaonCharactersData } from "../data/pharaon-apr-28.charactersmetadatas";

export const knownMovingPictures = [
  "Ramzes",
  "Ramzes XII",
  "Sara",
  "Nikotris",
  "Amenhotep",
  "Brat Ramzesa",
  "Chłop egipski",
  "Eunana",
  "Herhor",
  "Nikotris",
  "Nitager",
  "Patrokles",
  "Pentuer",
  "Tutmozis",
  "Pieszczota",
  "Anupa",
  "Dagon",
  "Gedeon",
];

const known = [
  "abeb-listens.mp4",
  "amenhotep-listens.mp4",
  "anupa-listens.mp4",
  "asarhadon-listens.mp4",
  "assar-listens.mp4",
  "bakura-listens.mp4",
  "beroes-listens.mp4",
  "brat-ramzesa-listens.mp4",
  "chłop-egipski-listens.mp4",
  "chłop-topiony-listens.mp4",
  "człowiek-opowiadający-legendy-listens.mp4",
  "dagon-listens.mp4",
  "dutmoze-listens.mp4",
  "egipski-chlop-listens.mp4",
  "ester-listens.mp4",
  "eunana-listens.mp4",
  "ezechiel-syn-rubena-listens.mp4",
  "gedeon-listens.mp4",
  "herhor-listens.mp4",
  "hiram-listens.mp4",
  "kama-listens.mp4",
  "kapłan-anonimowy-listens.mp4",
  "kapłanka-domu-zielonej-gwiazdy-listens.mp4",
  "mentezufis-listens.mp4",
  "murzyn-ramzesa-listens.mp4",
  "naczelny-rządca-dóbr-ramzesa-listens.mp4",
  "nikotris-listens.mp4",
  "nitager-listens.mp4",
  "otoes-listens.mp4",
  "patrokles-listens.mp4",
  "pentuer-listens.mp4",
  "pieszczota-listens.mp4",
  "rabsun-listens.mp4",
  "ramzes-listens.mp4",
  "ramzes-xii-listens.mp4",
  "ranuzer-listens.mp4",
  "samuel-syn-ezdreasza-listens.mp4",
  "sara-listens.mp4",
  "sargon-listens.mp4",
  "sofra-listens.mp4",
  "sędzia-listens.mp4",
  "tafet-listens.mp4",
  "tutmozis-listens.mp4",
  "urzędnik-dagona-poborca-listens.mp4",
  "wielki-pisarz-listens.mp4",
  "wioślarz-ramzesa-hyksos-listens.mp4",
  "żona-chłopa-topionego-listens.mp4",
  "abeb-speaks.mp4",
  "amenhotep-speaks.mp4",
  "anupa-speaks.mp4",
  "asarhadon-speaks.mp4",
  "assar-speaks.mp4",
  "bakura-speaks.mp4",
  "beroes-speaks.mp4",
  "brat-ramzesa-speaks.mp4",
  "chłop-egipski-speaks.mp4",
  "chłop-topiony-speaks.mp4",
  "człowiek-opowiadający-legendy-speaks.mp4",
  "dagon-speaks.mp4",
  "dutmoze-speaks.mp4",
  "egipski-chlop-speaks.mp4",
  "ester-speaks.mp4",
  "eunana-speaks.mp4",
  "ezechiel-syn-rubena-speaks.mp4",
  "gedeon-speaks.mp4",
  "herhor-speaks.mp4",
  "hiram-speaks.mp4",
  "kama-speaks.mp4",
  "kapłan-anonimowy-speaks.mp4",
  "kapłanka-domu-zielonej-gwiazdy-speaks.mp4",
  "mentezufis-speaks.mp4",
  "murzyn-ramzesa-speaks.mp4",
  "naczelny-rządca-dóbr-ramzesa-speaks.mp4",
  "nikotris-speaks.mp4",
  "nitager-speaks.mp4",
  "otoes-speaks.mp4",
  "patrokles-speaks.mp4",
  "pentuer-speaks.mp4",
  "pieszczota-speaks.mp4",
  "rabsun-speaks.mp4",
  "ramzes-speaks.mp4",
  "ramzes-xii-speaks.mp4",
  "ranuzer-speaks.mp4",
  "samuel-syn-ezdreasza-speaks.mp4",
  "sara-speaks.mp4",
  "sargon-speaks.mp4",
  "sofra-speaks.mp4",
  "sędzia-speaks.mp4",
  "tafet-speaks.mp4",
  "tutmozis-speaks.mp4",
  "urzędnik-dagona-poborca-speaks.mp4",
  "wielki-pisarz-speaks.mp4",
  "wioślarz-ramzesa-hyksos-speaks.mp4",
  "żona-chłopa-topionego-speaks.mp4",
];

export const getPictureFileNameForName = (name: string) => {
  return `${name.replace(/[\s()\\']+/g, "-").toLowerCase()}.png`;
};

const LOG_PREFIX = "Generated file path:";

export const getPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  const listensPath = `${name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/"/g, "")
    .replace(/(\(|\))/g, "")}-listens.mp4`;
  if (known.includes(listensPath)) {
    return `/${bookSlug}/${listensPath}`;
  }
  return `/${bookSlug}/${getPictureFileNameForName(name)}`;
};

export const getMovingPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  const speaksPath = `${name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/"/g, "")
    .replace(/(\(|\))/g, "")}-speaks.mp4`;
  if (known.includes(speaksPath)) {
    return `/${bookSlug}/${speaksPath}`;
  }
  return getPictureFilePathForName(name, bookSlug);
};

// const charactersToShow = ["Ramzes", "Ramzes XII", "Herhor", "Nitager", "Brat Ramzesa", "Amenhotep", "Nikotris"];

const filesFound: string[] = [];
pharaonCharactersData.forEach((character) => {
  const { characterName, bookSlug } = character;

  filesFound.push(getPictureFilePathForName(characterName, bookSlug as BOOK_SLUGS));
  filesFound.push(getMovingPictureFilePathForName(characterName, bookSlug as BOOK_SLUGS));
});

// known.forEach((file) => {
//   const found = filesFound.find((f) => f.includes(file));
//   if (!found) {
//     console.log(`File not found: ${file}`);
//   }
// });
