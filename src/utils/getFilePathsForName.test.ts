import { getListeningMediaFilePathForName } from "./getFilePathsForName";
import { BOOK_SLUGS } from "@/consts";
import { describe, expect, test } from "@jest/globals";

describe("getPictureFilePathForName", () => {
  test("example test", () => {
    const result = getListeningMediaFilePathForName("Ramzes", BOOK_SLUGS.PHARAON);
    expect(result).toEqual("/Pharaon/ramzes-listens.mp4");
  });
});
