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

const STYLE_TEMPLATE = `{
"backgroundStyle": "# Task
Create a non-distracting background image for an ebook that will have text overlaid on it. The image should function like a theatrical stage set or a 2D game background—a detailed but subtly rendered environment where action could take place.

## Instruction

### Illustration Style:
REPLACE_WITH_STYLE

### Core Principles
Thematic Resonance: The background must evoke the core themes of REPLACE_WITH_BOOK: (explain)

Consistent Art Style: The image must use the visual language of the character art: gentle curves, organic shapes, and a painterly, soft-edged feel.

Subtle Depth: The composition should have a clear foreground, midground, and background to create a sense of depth, but the overall contrast should be kept low and unified to prevent it from overpowering the text that will sit in front of it.

### Technical Execution
Color Palette: Harmonious and limited. Use a cohesive color scheme appropriate to the period and mood (e.g., sepia tones, cool blues, or warm earth colors). Avoid jarring color clashes or highly saturated distinct colors; the palette should feel blended, utilizing analogous colors or soft complementaries.

Lighting: Soft, diffused, and atmospheric. Light should appear to filter through haze, mist, or windows (e.g., golden hour, moonlight, or soft ambient glow). Avoid harsh shadows or high-contrast chiaroscuro. The lighting should wrap around objects to create volume without creating visual noise.

Detail & Focus: The background should have a 'soft focus' feel. Details should be broad, suggested, and impressionistic rather than sharp and clear, ensuring the environment doesn't draw the eye away from the text.
CRITICAL: The finish must be SMOOTH and MATTE. Do not use impasto, thick paint, visible canvas grain, or noisy textures. The image must be clean enough to read small text overlaid on top. Avoid cluttered scenes with many distinct small objects; rely on large shapes and textures.",
"periodStyle": "Define the specific era/setting here (e.g., 'Dystopian Future City' or '18th Century French Countryside')",
"avatarStyle": "Digital painting for an ebook avatar. Gentle, diffused lighting with low contrast. The color palette is harmonious and period-appropriate. MATCH THE BACKGROUND ART STYLE."
}`;

export const createGraphicalStyle = async (
  bookTitle: string,
  options?: { saveToFile?: boolean },
) => {
  const bookText = getBookTextForStyleAnalysis();
  const shouldSave = options?.saveToFile ?? true;

  const prompt = `You are an expert Art Director for ebook publishing. Your task is to analyze a book ${bookTitle} excerpt and generate a precise visual style guide in JSON format.

1. **Analyze** the provided <bookText> and <bookTitle> to determine the mood, era, and atmosphere.
2. **Select** the single most appropriate "Illustration Style" from the provided list of options below.
3. **Fill in the Template**: You must complete the 'backgroundStyle' template by replacing the placeholders.
    - IMPORTANT: When replacing REPLACE_WITH_STYLE, use the description exactly as written in the list. Do not add words like "impasto" or "heavy texture."
    - REPLACE_WITH_BOOK: Insert the book title.
    - (explain): Briefly explain the thematic resonance in 1 sentence.
4. Adjust the avatar style with the illustration style. Keep in mind - avatars should be more detailed than the backgrounds.

### List of Illustration Style Options (Choose One):

1. **Romantic Digital Fantasy:** A Romantic Digital Fantasy style mimicking the softness of airbrushing or soft-glaze oil painting. It relies heavily on "blooming" light effects and smooth gradients. The edges are feathered and indistinct, creating a dreamlike, ethereal atmosphere.
2. **Digital Pastel on Smooth Paper:** A Digital Pastel style rendered on smooth paper. The lighting is diffused and fuzzy, avoiding hard lines in favor of soft, smudged transitions that create a warm, intimate, and slightly rustic feel without visual noise or grain.
3. **Tonalist Smooth Painting:** A classic Tonalist style, resembling a "Brunaille" or an aged, varnished surface. The technique focuses on "sfumato"—the blurring of edges through thick atmosphere or haze. Brushwork is broad, blended, and sweeping, lacking fine detail or harsh strokes.
4. **Muted Gouache / Opaque Acrylic:** A Muted Gouache style. Forms are defined and slightly "blocky," with light and shadow carved out in distinct planes. Resembles 2D game concept art where paint is applied opaquely, giving surfaces a matte, smooth finish.
5. **Romantic Fantasy Glazing:** A Romantic Fantasy style characterized by deep, warm shadows and piercing "god rays" of golden light. Uses soft glazing techniques (thin layers of smooth paint) to create a dreamlike quality where textures merge gently into darkness.
6. **Historical Realism / Soft Focus:** Resembling a 19th-century oil study but rendered digitally for smoothness. The palette is dominated by muted earth tones. Brushwork is loose but blended to suggest terrain and fabric without heavy texture.
7. **Gothic Atmospheric Mist:** Evocative of Victorian mystery. Relies on heavy fog and gloom to obscure architectural details, focusing on the interplay between oppressive shadows and warm, diffused gas lamps. Surfaces appear wet or slick but smooth.
8. **Vintage Narrative Poster:** Reminiscent of mid-20th-century gouache or poster art. Features strong silhouettes and simplified geometry. The mood is established through a limited, brooding color palette and distinct shape design rather than intricate surface detail.
9. **Cinematic Noir Concept Art:** Focus on cold, oppressive symmetry. Leans toward photorealism but maintains a stylized, matte finish. Lighting is cool-toned, creating distinct pools of illumination but keeping the shadows soft and noise-free.

## Style template:
<style_template>
${STYLE_TEMPLATE}
</style_template>

## Excerpt
  <bookText>
  ${bookText}
  </bookText>


## Output JSON Format:

{
"backgroundStyle": "(The full, filled-out text of the prompt template)",
"periodStyle": "(A short string defining the specific era/setting, e.g., '1920s Prohibition Chicago' or 'Medieval Fantasy Tavern')",
"avatarStyle": "adjusted avatarStyle"
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
<style_template>
${STYLE_TEMPLATE}
</style_template>

IMPORTANT:
- Use the periodStyle provided: "${periodStyle}"
- Expand the user's vision into rich, detailed prompts for both backgrounds and avatars
- Do not specify scene elements - keep it generic (style, colors, mood, artistic influences)
- backgroundStyle should start with "Digital painting for an ebook background..."
- avatarStyle should start with "Digital painting for an ebook avatar..."
- Make sure the style is cohesive between backgrounds and avatars
- If the user passes a description like "in the style of X", describe that style and don't repeat the artist name

CRITICAL COMPOSITION RULES (must be included in backgroundStyle):
- Create non-distracting backgrounds for an ebook with text overlaid
- Details should be suggested and impressionistic, not sharp and clear
- Overall contrast should be low enough to not overpower text
- Clear foreground/midground/background for depth
- Avoid cluttered scenes with many distinct small objects 

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
<style_template>
${STYLE_TEMPLATE}
</style_template>

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

CRITICAL COMPOSITION RULES (must be included in backgroundStyle):
- Create non-distracting backgrounds for an ebook with text overlaid
- The image should function like a theatrical stage set—detailed but subtly rendered
- Details should be suggested and impressionistic, not sharp and clear
- Overall contrast should be low enough to not overpower text
- Clear foreground/midground/background for depth
- Avoid cluttered scenes with many distinct small objects

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

if (require.main === module) {
  const doIt = async () => {
    const response = await createGraphicalStyle("Agatha Christie, The Mysterious Affair at Styles");
    console.log(response);
  };
  doIt();
}
