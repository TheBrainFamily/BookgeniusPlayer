// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { getAllVariants } from "./getAllVariants";
import fs from "fs";

const variants = getAllVariants();

const smallerVariants = variants.map((variant) => ({ [variant.id]: variant.simplifications[0].sentences[0] }));

fs.writeFileSync("smallerVariants.ts", `export const getAllVariants = () => ${JSON.stringify(smallerVariants, null, 2)};`);
