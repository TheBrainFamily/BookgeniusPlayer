import { z } from "zod";
import { callGeminiWrapper } from "../../callClaude";
import { callGeminiWithImage } from "../../callFastGemini";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { writeBookFile } from "../../helpers/writeBookFile";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";

export type GraphicalStyle = { backgroundStyle: string; periodStyle: string; avatarStyle: string };

/** Extract book text from first chapters (up to 10000 chars) for style analysis */
function getBookTextForStyleAnalysis(): string {
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
  return bookText;
}

/** Shared style examples used in both auto and user-guided generation */
const STYLE_EXAMPLES = `{
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
}`;

export const createGraphicalStyle = async (bookTitle: string, options?: { saveToFile?: boolean }) => {
  const bookText = getBookTextForStyleAnalysis();
  const shouldSave = options?.saveToFile ?? true;

  const prompt = `Based on the book title ${bookTitle}, and beginning of the book, create a graphical style for the book. Make sure it's time appropriate.

  <bookText>
  ${bookText}
  </bookText>
  
  Good examples:
  ${STYLE_EXAMPLES}

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

  if (shouldSave) {
    writeBookFile("graphicalStyle.json", JSON.stringify(response, null, 2), FILE_TYPE.TEMPORARY);
  }
  return response as GraphicalStyle;
};

export const expandUserStyleDescription = async (
  userDescription: string,
  periodStyle: string,
): Promise<GraphicalStyle> => {
  const bookText = getBookTextForStyleAnalysis();

  const prompt = `You are helping create a graphical style for an ebook. The user has provided a general style description that they want for this book.

Your task: Expand the user's description into detailed, professional prompts suitable for AI image generation. The book takes place during ${periodStyle}, so incorporate time-appropriate elements.

User's style description: "${userDescription}"

<bookText>
${bookText}
</bookText>

Good examples of the output format:
${STYLE_EXAMPLES}

IMPORTANT:
- Use the periodStyle provided: "${periodStyle}"
- Expand the user's vision into rich, detailed prompts for both backgrounds and avatars
- Do not specify scene elements - keep it generic (style, colors, mood, artistic influences)
- backgroundStyle should start with "Digital painting for an ebook background..."
- avatarStyle should start with "Digital painting for an ebook avatar..."
- Make sure the style is cohesive between backgrounds and avatars
- if the user passes a desscription like "in the style of X", describe that style and don't repeat the artist name, the image generator has no knowledge about specific people so that will only be confusing. 

Return format:
{
  "backgroundStyle": "string",
  "periodStyle": "${periodStyle}",
  "avatarStyle": "string"
}`;

  const schema = z.object({
    backgroundStyle: z.string(),
    periodStyle: z.string(),
    avatarStyle: z.string(),
  }) as z.ZodType<GraphicalStyle>;

  const response = await callGeminiWrapper(prompt, schema, 10);
  return response as GraphicalStyle;
};

export const createGraphicalStyleFromCover = async (
  bookTitle: string,
  bookText: string,
  coverImageBase64: string,
  coverArtist?: string,
  mimeType: string = "image/jpeg",
): Promise<GraphicalStyle> => {
  const artistInfo = coverArtist ? `The cover art is by ${coverArtist}. ` : "";

  const prompt = `You are analyzing this book cover to create a cohesive graphical style for an interactive ebook.

Book: "${bookTitle}"
${artistInfo}

Analyze the cover image carefully:
1. What is the artistic MEDIUM? (oil painting, watercolor, engraving, lithograph, photograph, etc.)
2. What is the artistic style? (Impressionist, Realist, Art Nouveau, Romantic, Pre-Raphaelite, etc.)
3. What is the color palette? (dominant colors, mood, warmth/coolness)
4. What is the technique? (brushwork, texture, lighting, linework)
5. What era/period does the art evoke?
6. What mood does it convey?

Now create a graphical style that matches this cover art for generating consistent background images and character avatars throughout the ebook.

Here's a sample of the book's text to help you understand the period and setting:
<bookText>
${bookText.substring(0, 5000)}
</bookText>

Good examples of output format:
${STYLE_EXAMPLES}

CRITICAL REQUIREMENTS:
- Your style MUST match the cover art's aesthetic AND medium
- If the cover is an oil painting, describe an oil painting style
- If the cover is a watercolor, describe a watercolor style  
- If the cover is an engraving or etching, describe that technique
- Do NOT default to "Digital painting" - match the actual medium of the cover
- Do NOT name specific artists in the style descriptions (image generators don't know them)
- Instead, describe the VISUAL QUALITIES: brushwork, color relationships, lighting approach, texture
- backgroundStyle should start with the appropriate medium (e.g., "Oil painting for an ebook background...", "Watercolor illustration for an ebook background...", "Detailed engraving style for an ebook background...")
- avatarStyle should use the same medium as backgroundStyle
- periodStyle is for HISTORICAL ACCURACY - it tells the image generator what era the book is set in, so it doesn't add anachronistic elements (e.g., modern cars in 1890s London). Base this on the BOOK'S SETTING from the text, not the cover art's era.

Return format:
{
  "backgroundStyle": "string - detailed style for background images matching cover aesthetic and medium",
  "periodStyle": "string - the time period and location of the book's setting, e.g. 'Early 20th century Dublin', 'Victorian England', '1920s New York'",
  "avatarStyle": "string - detailed style for character avatars matching cover aesthetic and medium"
}`;

  const schema = z.object({
    backgroundStyle: z.string(),
    periodStyle: z.string(),
    avatarStyle: z.string(),
  }) as z.ZodType<GraphicalStyle>;

  const response = await callGeminiWithImage(prompt, coverImageBase64, mimeType, schema);
  return response;
};
