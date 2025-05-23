export const getTitle = (chapter: number) => {
  // Special case for 0
  if (chapter === 0) return "Rozdział Zero";

  // Units (1-9)
  const units = ["", "Pierwszy", "Drugi", "Trzeci", "Czwarty", "Piąty", "Szósty", "Siódmy", "Ósmy", "Dziewiąty"];

  // Teens (11-19)
  const teens = ["Dziesiąty", "Jedenasty", "Dwunasty", "Trzynasty", "Czternasty", "Piętnasty", "Szesnasty", "Siedemnasty", "Osiemnasty", "Dziewiętnasty"];

  // Tens (10, 20, 30, etc.)
  const tens = ["", "Dziesiąty", "Dwudziesty", "Trzydziesty", "Czterdziesty", "Pięćdziesiąty", "Sześćdziesiąty", "Siedemdziesiąty", "Osiemdziesiąty", "Dziewięćdziesiąty"];

  // Hundreds (100, 200, etc.) - in case they're needed for very large books
  const hundreds = ["", "Setny", "Dwusetny", "Trzysetny", "Czterysetny", "Pięćsetny", "Sześćsetny", "Siedemsetny", "Osiemsetny", "Dziewięćsetny"];

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

  return `Rozdział ${chapterName.trim()}`;
};
