import { z } from "zod";
import { callGeminiWrapper } from "../../callClaude";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { writeBookFile } from "../../helpers/writeBookFile";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";

export type GraphicalStyle = { backgroundStyle: string; periodStyle: string; avatarStyle: string };
export const createGraphicalStyle = async (bookTitle: string) => {
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
{
  "backgroundStyle": "Brutalist industrial realism. A heavy, tactile aesthetic defined by raw textures, cold surfaces, and imposing structures. The lighting is harsh and functional, creating a sense of isolation and utilitarian grit. Color palette dominated by cold greys, rusted iron, and sickly sodium-vapor yellows. The mood is uncompromising, heavy, and starkly realistic.",
  "periodStyle": "Late 20th Century Industrial / Dystopian",
  "avatarStyle": "Gritty, realistic digital painting with a focus on weathered textures and harsh, direct lighting. The aesthetic is cold and unyielding, using a desaturated palette to emphasize a sense of exhaustion, resilience, or industrial rot."
}
{
  "backgroundStyle": "Golden Age illustration style. Intricate line work combined with soft watercolor washes. The aesthetic is whimsical yet slightly melancholic, featuring elegant, flowing ornamentation and flattened perspectives. Color palette of muted jewel tones, antique golds, and faded parchment. The atmosphere is mythical and timeless, with a focus on decorative beauty and narrative detail.",
  "periodStyle": "Early 20th Century Storybook Illustration",
  "avatarStyle": "Stylized digital painting evoking Golden Age illustrators. Fine, delicate outlines and a soft, matte color finish. The character design emphasizes elegant silhouettes and a sense of ancient mystery or folkloric charm."
}
{
  "backgroundStyle": "Minimalist abstract digital art. A conceptual aesthetic focusing on layered textures, organic gradients, and symbolic geometry. The style is non-representational and atmospheric, using a sophisticated, muted palette of sage, sand, and deep navy. The feel is cerebral and contemplative, using negative space and distressed textures to create a sense of mystery and modern sophistication.",
  "periodStyle": "Contemporary / Universal",
  "avatarStyle": "Abstracted digital portraiture. Features a blend of sharp geometric shapes and soft, bleeding ink textures. The style is more concerned with mood and psychological state than literal features, using a limited but bold color palette and high artistic stylization."
}
{
  "backgroundStyle": "Impressionist oil painting style inspired by Claude Monet. Focuses on the transient effects of light and atmosphere through soft, dappled brushstrokes. The composition is airy and ethereal, utilizing a high-key color palette of vibrant pastels, shimmering blues, and sun-drenched golds. The feel is romantic and fleeting, with a heavy emphasis on texture and color harmony over sharp lines.",
  "periodStyle": "Late 19th Century French Impressionism",
  "avatarStyle": "Digital painting with soft Impressionist brushwork. Gentle, diffused lighting that blends the subject into the atmosphere. The color palette is luminous and varied, using visible strokes of lavender, rose, and pale ochre. Captures a sense of quiet movement and natural elegance."
}


This one worked really great when the mood matches:
{
  "backgroundStyle": "Expressionist Graphic Noir. High-contrast digital painting with a stark, moody atmosphere. Sharp angles and deep, dramatic shadows dominate the composition. The aesthetic is painterly and theatrical rather than photorealistic, emphasizing monumental scale and oppressive order. Color palette is primarily monochromatic—charcoal, slate, and ink-black—punctuated by striking, symbolic red accents. Soft-focus textures ensure a non-distracting depth.",
  "periodStyle": "Mid-20th Century Alternative History / Noir",
  "avatarStyle": "Digital painting in an Expressionist Graphic Noir style. High-contrast character rendering with sharp, dramatic lighting and deep shadows. The look is stylized and gritty, featuring a monochromatic palette with bold red highlights. Focuses on psychological depth and a sense of gravity or hidden conspiracy."
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
