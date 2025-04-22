import { getPictureFilePathForName } from "./getFilePathsForName";
import { BOOK_SLUGS } from "@/src/consts";
import { describe, expect, test } from "@jest/globals";

describe("getPictureFilePathForName", () => {
  test("example test", () => {
    const result = getPictureFilePathForName("Ramzes", BOOK_SLUGS.PHARAON);
    expect(result).toEqual("/Pharaon/ramzes-listens.mp4");
  });
});
