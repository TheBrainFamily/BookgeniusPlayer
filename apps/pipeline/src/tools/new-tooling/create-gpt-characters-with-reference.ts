import Replicate from "replicate";
import dotenv from "dotenv";
import fs from "fs";

import { generateTagName } from "../../helpers/generateTagName";

dotenv.config();

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// Define a type for the Replicate output
type ReplicateOutput = { url: () => string }[];

const characterList = [
  // {
  //   characterName: "Złośliwy czarodziej",
  //   visualDescription:
  //     "A gaunt, sharp-featured sorcerer with ash-grey beard, piercing green eyes, and a mocking smile. Wears a ragged midnight-blue robe stitched with frosty runes and carries a crooked ebony staff that crackles with cold light.",
  // },
  // {
  //   characterName: "Uczniowie czarodzieja",
  //   visualDescription:
  //     "A pair of lanky youths in soot-smudged cloaks, eyes glinting with mischief. Their pockets bulge with cracked mirror shards, and their fingers are stained with alchemical soot.",
  // },
  // {
  //   characterName: "Rodzice Kaja",
  //   visualDescription:
  //     "Kindly working-class couple: a broad-shouldered father in a wool cap dusted with chimney ash, and a gentle mother in a patched linen shawl. Their hands are calloused, their smiles warm.",
  // },
  // {
  //   characterName: "Rodzice Gerdy",
  //   visualDescription:
  //     "Cheerful, rosy-cheeked parents dressed in simple homespun. The mother keeps a basket of herbs at her waist, while the father sports a sturdy leather apron from tending rooftop plants.",
  // },
  // {
  //   characterName: "Chłopcy z rynku",
  //   visualDescription:
  //     "A boisterous gang of town lads in threadbare coats and knit caps, cheeks red from the cold. They clutch wooden sleds and laugh with wind-chapped lips. In a cute town square.",
  // },
  {
    characterName: "Wróble",
    visualDescription:
      "Tiny, quick brown sparrows with dark beady eyes and russet patches on their wings, forever hopping along railings and chirping encouragement. No humans visible.",
    isNonHuman: true,
  },
  // {
  //   characterName: "Róże z ogrodu wróżki",
  //   visualDescription:
  //     "Velvety crimson and blush-pink roses growing on winding emerald stems, each bloom glimmering with a faint golden dust as though kissed by sunlight even at dusk. Garden. No humans visible.",
  //   isNonHuman: true,
  // },
  // {
  //   characterName: "Damy dworu księżniczki",
  //   visualDescription:
  //     "Elegant ladies in pastel brocade gowns, hair piled high and adorned with pearls. They carry silken fans and exchange knowing glances behind jeweled masks. No weapons. In a ballroom.",
  // },
  // {
  //   characterName: "Woźnica",
  //   visualDescription:
  //     "Sturdy coachman with a neatly trimmed beard, wearing a dark livery edged in gold braid and a small crown-shaped cap. Stands proudly by the gilt carriage.",
  // },
  // {
  //   characterName: "Lokaj",
  //   visualDescription:
  //     "Tall, solemn footman in immaculate livery, white gloves, and polished boots. A slim golden coronet pins his cloak, and he maintains impeccable posture.",
  // },
  // {
  //   characterName: "Stara rozbójnica",
  //   visualDescription:
  //     "Weather-beaten woman with wild gray hair, fierce coal-black eyes, and a jagged scar across one cheek. Draped in patched furs and clanking with mismatched knives and trinkets.",
  // },
  {
    characterName: "Gołębie leśne",
    visualDescription:
      "Plump, soft-feathered wood pigeons with gentle amber eyes and iridescent neck plumage. They nest among rafters and coo in soothing, echoing tones in a forest. No humans visible.",
    isNonHuman: true,
  },
  // {
  //   characterName: "Płatki śnieżne (Straże Królowej Śniegu)",
  //   visualDescription:
  //     "Glittering crystalline figures shaped like giant snowflakes, each facet razor-sharp. Snow queen guards. They drift and spin in the air, their translucent bodies refracting pale blue light. In front of ice castle.",
  // },
  {
    characterName: "Małe aniołki",
    visualDescription:
      "Tiny cherub-like beings, delicate wings of shimmering mist, and halos that glow faintly gold. Armed with miniature spears and shields of light. Dressed in armor. No humans visible.",
    isNonHuman: true,
  },
  // {
  //   characterName: "Towarzysz rena",
  //   visualDescription:
  //     "A larger, cinnamon-furred reindeer with sweeping antlers and wise, observant eyes. On four legs. Wears a simple leather harness adorned with a single silver bell. In a forest.",
  //   isNonHuman: true,
  // },
];

const downloadAndSave = async (url: string, fileName: string) => {
  const response = await fetch(url);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(fileName, buffer);
};

const doIt = async () => {
  await Promise.all(
    characterList.map(async (character) => {
      let stylePrompt = `A cinematic-style vibrant fantasy character portrait for a video game, designed like a dramatic teaser poster. Rich, saturated colors and magical lighting, with enchanted fantasy elements in the background. The composition highlights dynamic posture, detailed costume, and powerful presence, inspired by classic fairy-tale painting styles fused with modern Marvel-style impact. Use the reference images for color and mood.`;

      if (character.isNonHuman) {
        stylePrompt = `A cinematic-style vibrant fantasy avatar for a video game, designed like a dramatic teaser poster. No Text!! Rich, saturated colors and magical lighting, with enchanted fantasy elements in the background. The composition highlights powerful presence, inspired by classic fairy-tale painting styles. Use the reference images for color and mood.`;
      }
      const input = {
        prompt: `${stylePrompt} ${character.visualDescription}`,
        quality: "high",
        background: "opaque",
        moderation: "low",
        aspect_ratio: "1:1",
        input_images: [
          "https://replicate.delivery/pbxt/N0a4Lf3ggO2mRtOrc5tOG9V4gBCZJzYPx6qFXgBNsN17lc3M/image%20%284%29.png",
          "https://replicate.delivery/pbxt/N0a4LUQDzS9ixhzE2SCncTXT5ByuxSiECpzouhBcQHxML8K8/image%20%282%29.png",
        ],
        output_format: "png",
        openai_api_key: process.env.OPENAI_API_KEY,
        number_of_images: 1,
        output_compression: 90,
      };
      try {
        const output = (await replicate.run("openai/gpt-image-1.5", { input })) as ReplicateOutput;

        // To access the file URL:
        console.log(output[0].url()); //=> "http://example.com"

        // To write the file to disk:
        downloadAndSave(output[0].url(), `${generateTagName(character.characterName)}.png`);
      } catch (e) {
        console.log(e);
      }

      // fs.writeFileSync(`${generateTagName(character.characterName)}.png`, output[0]);

      const moreImages = [
        "https://replicate.delivery/pbxt/N0a4Lf3ggO2mRtOrc5tOG9V4gBCZJzYPx6qFXgBNsN17lc3M/image%20%284%29.png",
        "https://replicate.delivery/pbxt/N0a4LUQDzS9ixhzE2SCncTXT5ByuxSiECpzouhBcQHxML8K8/image%20%282%29.png",
        "https://replicate.delivery/pbxt/N0m5z6hAS13CvoIWN80untfzULWGdRS48u4bMZVW97VUDbZZ/OpenAI%20Playground%202025-05-14%20at%2020.33.24.png",
        "https://replicate.delivery/pbxt/N0m5zHGd5I5Y2h69oA42mOPftSuOyixP8I4fxQdNddOGyqhi/OpenAI%20Playground%202025-05-14%20at%2020.33.32.png",
        "https://replicate.delivery/pbxt/N0m5zs6l0GNOpFJiNIczA2MOxeTqoHZyKdbC89PaLvYLlvgm/OpenAI%20Playground%202025-05-14%20at%2020.32.48.png",
        "https://replicate.delivery/pbxt/N0m5zVmkAJmsiLa2zUrjSoyF5tD22iivae6OY4sdNX6oQ8Zt/OpenAI%20Playground%202025-05-14%20at%2020.34.55.png",
        "https://replicate.delivery/pbxt/N0m5zyvOTDI8acd4nUrOsbWmSuLfijVw0sKKFJBxMZECfj6U/OpenAI%20Playground%202025-05-14%20at%2020.35.05.png",
      ];

      const nextInput = {
        prompt: `${stylePrompt} ${character.visualDescription}`,
        quality: "high",
        background: "opaque",
        moderation: "low",
        aspect_ratio: "1:1",
        input_images: moreImages,
        output_format: "png",
        openai_api_key: process.env.OPENAI_API_KEY,
        number_of_images: 1,
        output_compression: 90,
      };

      try {
        const nextOutput = (await replicate.run("openai/gpt-image-1.5", {
          input: nextInput,
        })) as ReplicateOutput;

        // To access the file URL:
        console.log(nextOutput[0].url()); //=> "http://example.com"

        downloadAndSave(
          nextOutput[0].url(),
          `${generateTagName(character.characterName)}-more_images.png`,
        );
      } catch (e) {
        console.log(e);
      }
      // To write the file to disk:
      // fs.writeFileSync(`${generateTagName(character.characterName)}-more_images.png`, nextOutput[0]);
    }),
  );
};

doIt();

// downloadAndSave(
//   "https://replicate.delivery/xezq/dFfqkrpxi81qOycdcwkRpmAgNraztD1ZHG9ektLootwRX0sUA/tmpkuy0zzth.png",
//   "test.png",
// );
