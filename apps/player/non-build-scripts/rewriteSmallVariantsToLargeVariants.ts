// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

// import fs from "fs";
// import path from "path";
// import { getAllVariants } from "./smallerVariants";

// const smallerVariants = getAllVariants() as Array<{ [key: string]: string }>;

// type LargeVariant = { id: string; simplifications: { score: number; sentences: string[] }[] };

// const largeVariants: LargeVariant[] = smallerVariants.map((variant) => {
//   const id = Object.keys(variant)[0];
//   const sentence = variant[id];
//   return { id, simplifications: [{ score: 50, sentences: [sentence] }] };
// });

// fs.writeFileSync(
//   path.join(__dirname, "getAllVariants.ts"),
//   `export const getAllVariants = (): { id: string; simplifications: { score: number; sentences: string[] }[] }[] => ${JSON.stringify(largeVariants, null, 2)};`,
// );

import fs from "fs";
import path from "path";
import { getAllVariants } from "./smallerVariants";

const smallerVariants = getAllVariants() as Array<{ simplification: string; id: string }>;

type LargeVariant = { id: string; simplifications: { score: number; sentences: string[] }[] };

const largeVariants: LargeVariant[] = smallerVariants.map((variant) => {
  const { id, simplification } = variant;
  return { id, simplifications: [{ score: 50, sentences: [simplification] }] };
});

fs.writeFileSync(
  path.join(__dirname, "getAllVariants.ts"),
  `export const getAllVariants = (): { id: string; simplifications: { score: number; sentences: string[] }[] }[] => ${JSON.stringify(largeVariants, null, 2)};`,
);
