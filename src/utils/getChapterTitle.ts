import { useTranslation } from "react-i18next";

export const getTitle = (chapter: number) => {
  const { t } = useTranslation();
  // Special case for 0
  if (chapter === 0) return "Rozdział Zero";

  // Units (1-9)
  const units = ["", t("ordinal.1"), t("ordinal.2"), t("ordinal.3"), t("ordinal.4"), t("ordinal.5"), t("ordinal.6"), t("ordinal.7"), t("ordinal.8"), t("ordinal.9")];

  // Teens (11-19)
  const teens = [
    t("ordinal.10"),
    t("ordinal.11"),
    t("ordinal.12"),
    t("ordinal.13"),
    t("ordinal.14"),
    t("ordinal.15"),
    t("ordinal.16"),
    t("ordinal.17"),
    t("ordinal.18"),
    t("ordinal.19"),
  ];

  // Tens (10, 20, 30, etc.)
  const tens = ["", t("ordinal.10"), t("ordinal.20"), t("ordinal.30"), t("ordinal.40"), t("ordinal.50"), t("ordinal.60"), t("ordinal.70"), t("ordinal.80"), t("ordinal.90")];

  // Hundreds (100, 200, etc.) - in case they're needed for very large books
  const hundreds = [
    "",
    t("ordinal.100"),
    t("ordinal.200"),
    t("ordinal.300"),
    t("ordinal.400"),
    t("ordinal.500"),
    t("ordinal.600"),
    t("ordinal.700"),
    t("ordinal.800"),
    t("ordinal.900"),
  ];

  let chapterName = "";

  if (chapter >= 100) {
    const hundred = Math.floor(chapter / 100);
    chapterName += hundreds[hundred] + " ";
    chapter %= 100;
  }

  if (chapter >= 20) {
    const ten = Math.floor(chapter / 10);
    const unit = chapter % 10;
    chapterName += tens[ten];
    if (unit > 0) {
      chapterName += " " + units[unit];
    }
  } else if (chapter >= 10) {
    chapterName += teens[chapter - 10];
  } else {
    chapterName += units[chapter];
  }

  return `${t("chapter")} ${chapterName.trim()}`;
};
