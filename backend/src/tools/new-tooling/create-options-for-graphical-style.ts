import { z } from "zod";
import { callGeminiWrapper } from "../../callClaude";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { writeBookFile } from "../../helpers/writeBookFile";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";

export type GraphicalStyle = { backgroundStyle: string; periodStyle: string; avatarStyle: string };
export const createOptionsForGraphicalStyle = async (bookTitle: string, suggestion?: string) => {
  let bookText = "";
  const bookChapters = getChaptersUpTo(
    getBookSettings().startFromChapter,
    getBookSettings().startFromChapter + getBookSettings().numberOfChaptersToProcess,
  );

  for (const chapter of bookChapters) {
    if (bookText.length > 10000) {
      break;
    }
    bookText += `<chapter number="${chapter.number}"><title>${chapter.title}</title><content>${chapter.content}</content></chapter>`;
  }
  const prompt = `Based on the book title ${bookTitle}, and beginning of the book, create a graphical style for the book. Make sure it's time appropriate.

  <bookText>
  ${bookText}
  </bookText>
  
  Good examples:
  {
    "backgroundStyle": "Digital painting for an ebook background. Soft cinematic-style. Dark psychological noir aesthetic set in late Victorian London. Cinematic lighting accentuates intrigue, paranoia, and moral ambiguity through stark but soften contrasts and heavy shadows. Color palette dominated by muted greys, deep browns, and shadowy blues punctuated subtly by lantern yellows and hazy gaslight ambience. Vintage espionage illustrations, Victorian noir atmospherics, and trending moody realism.",
    "periodStyle": "Victorian England",
    "avatarStyle": "Digital painting for an ebook avatar. Soft cinematic-style. Dark psychological noir aesthetic set in late Victorian London. Cinematic lighting accentuates intrigue, paranoia, and moral ambiguity through stark but soften contrasts and heavy shadows. Color palette dominated by muted greys, deep browns, and shadowy blues punctuated subtly by lantern yellows and hazy gaslight ambience. Influenced by vintage espionage illustrations, Victorian noir atmospherics, and trending moody realism.",
  },
  {
  "backgroundStyle": "Digital painting for an ebook background. Epic adventure style inspired by late 19th-century colonial explorations in Egypt and Sudan. Warm, sun-drenched cinematic aesthetic evoking the vast deserts. Dramatic lighting with golden hour sunsets, highlighting themes of peril, discovery, and youthful bravery. Color palette featuring earthy ochres, terracotta reds, deep Nile blues, and vibrant greens of fertile valleys, accented by torchlight oranges and starry night skies. Influenced by vintage adventure illustrations, Orientalist paintings, and trending historical realism.",
  "periodStyle": "Late 19th Century Colonial Egypt and Sudan",
  "avatarStyle": "Digital painting for an ebook avatar. Epic adventure style inspired by late 19th-century colonial explorations in Egypt and Sudan. Warm, sun-drenched cinematic aesthetic evoking the vast deserts, lush Nile oases, and ancient ruins. Themes of peril, discovery, and youthful bravery. Color palette featuring earthy ochres, terracotta reds, deep Nile blues, and vibrant greens of fertile valleys, accented by torchlight oranges and starry night skies. Influenced by vintage adventure illustrations, Orientalist paintings, and trending historical realism."
}

Do not specify any elements in the backgroundStyle or avatarStyle, as those will be then used for every single image as part of a wider prompt. Make this generic, talk only about style, period, and overall feel. 

  
  It has to be in a format: {
    "backgroundStyle": "string",
    "periodStyle": "string",
    "avatarStyle": "string",
  }`;
  const schema = z.object({
    backgroundStyle: z.string(),
    periodStyle: z.string(),
    avatarStyle: z.string(),
  }) as z.ZodType<GraphicalStyle>;
  const response = await callGeminiWrapper(prompt, schema, 10);

  writeBookFile("graphicalStyle.json", JSON.stringify(response, null, 2), FILE_TYPE.TEMPORARY);
  return response as GraphicalStyle;
};
