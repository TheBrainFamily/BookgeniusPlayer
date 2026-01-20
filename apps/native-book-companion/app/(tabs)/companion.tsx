import { skip, useQuery } from "convex/react";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { useScanSession } from "@/contexts/scan-session-context";
import { api } from "@convex/_generated/api";

interface Chapter {
  number: number;
  title: string;
  startPage: number;
  endPage: number;
}

interface ChapterSummaryInfo {
  summary: string;
  isFirstAppearance: boolean;
}

interface CharacterProfile {
  slug: string;
  name: string;
  globalSummary: string;
  avatarUrl?: string | null;
  chapterSummaries: Record<number, ChapterSummaryInfo>;
  color: string;
  iconName: keyof typeof MaterialIcons.glyphMap;
}

interface CharacterAppearanceMap {
  [chapterNumber: number]: string[];
}

const COLOR_PALETTE = [
  "#f97316",
  "#8b5cf6",
  "#22c55e",
  "#06b6d4",
  "#6366f1",
  "#ec4899",
  "#eab308",
  "#14b8a6",
  "#64748b",
];

const ICONS: Array<keyof typeof MaterialIcons.glyphMap> = [
  "person",
  "person-outline",
  "person-pin",
  "face",
  "tag-faces",
  "emoji-people",
  "people",
  "person-add",
  "person",
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildChapters(sources: Array<{ chapterNumber: number; title?: string | null; paragraphCount?: number | null; }>): Chapter[] {
  const sorted = [...sources].sort((a, b) => a.chapterNumber - b.chapterNumber);
  let pageCursor = 1;
  return sorted
    .filter((source) => source.chapterNumber > 0)
    .map((source) => {
      const paragraphs = Math.max(source.paragraphCount ?? 1, 1);
      const estimatedPages = Math.max(Math.ceil(paragraphs / 10), 1);
      const startPage = pageCursor;
      const endPage = pageCursor + estimatedPages - 1;
      pageCursor = endPage + 1;
      return {
        number: source.chapterNumber,
        title: source.title ?? `Chapter ${source.chapterNumber}`,
        startPage,
        endPage,
      };
    });
}

function buildPages(chapters: Chapter[]) {
  const maxPage = chapters.reduce((max, chapter) => Math.max(max, chapter.endPage), 1);
  return Array.from({ length: maxPage }, (_, index) => index + 1);
}

function parseCharacterSlugs(html: string) {
  const results = new Set<string>();
  const speakerRegex = /data-speaker\s*=\s*"([^"]+)"/g;
  const characterRegex = /data-c\s*=\s*"([^"]+)"/g;

  let match = speakerRegex.exec(html);
  while (match) {
    results.add(match[1]);
    match = speakerRegex.exec(html);
  }

  match = characterRegex.exec(html);
  while (match) {
    results.add(match[1]);
    match = characterRegex.exec(html);
  }

  return Array.from(results);
}

export default function CompanionScreen() {
  const {
    companionBookSlug,
    selectedChapterNumber,
    selectedPage,
    setSelectedChapterNumber,
    setSelectedPage,
  } = useScanSession();

  const bookPath = companionBookSlug ? `books/${companionBookSlug}` : null;
  const characterBundles = useQuery(
    api.bookQueries.listCharacterBundles,
    bookPath ? { bookPath } : skip,
  );
  const chaptersSource = useQuery(
    api.bookQueries.listHtmlSourceChapters,
    bookPath ? { bookPath } : skip,
  );
  const chapterSummaries = useQuery(
    api.metadata.listAllChapterSummariesForBook,
    bookPath ? { bookPath } : skip,
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [charactersByChapter, setCharactersByChapter] = useState<CharacterAppearanceMap>({});
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterProfile | null>(null);

  const isLoading =
    bookPath &&
    (characterBundles === undefined || chaptersSource === undefined || chapterSummaries === undefined);

  const chapters = useMemo(() => {
    if (!chaptersSource) return [];
    return buildChapters(chaptersSource);
  }, [chaptersSource]);

  const pages = useMemo(() => buildPages(chapters), [chapters]);

  const chapterSummariesByCharacter = useMemo(() => {
    const map: Record<string, Record<number, ChapterSummaryInfo>> = {};
    if (!chapterSummaries) return map;
    for (const summary of chapterSummaries) {
      if (!map[summary.characterSlug]) {
        map[summary.characterSlug] = {};
      }
      map[summary.characterSlug][summary.chapterNumber] = {
        summary: summary.summary,
        isFirstAppearance: summary.isFirstAppearance,
      };
    }
    return map;
  }, [chapterSummaries]);

  const characters = useMemo<CharacterProfile[]>(() => {
    if (!characterBundles) return [];
    return characterBundles
      .map((bundle) => {
        const hash = hashString(bundle.slug);
        return {
          slug: bundle.slug,
          name: bundle.name,
          globalSummary: bundle.metadata.summary ?? "Summary coming soon.",
          avatarUrl: bundle.avatarLarge?.url ?? bundle.avatar?.url,
          chapterSummaries: chapterSummariesByCharacter[bundle.slug] ?? {},
          color: COLOR_PALETTE[hash % COLOR_PALETTE.length],
          iconName: ICONS[hash % ICONS.length],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [characterBundles, chapterSummariesByCharacter]);

  const filteredCharacters = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    const activeSet = charactersByChapter[selectedChapterNumber] ?? [];
    const base = trimmed ? characters : activeSet.length ? characters.filter((char) => activeSet.includes(char.slug)) : characters;

    if (!trimmed) return base;

    const tokens = trimmed.split(/\s+/g).filter(Boolean);
    return base.filter((char) => {
      const target = char.name.toLowerCase();
      if (target.includes(trimmed)) return true;
      return tokens.every((token) => fuzzyMatch(token, target));
    });
  }, [characters, charactersByChapter, searchQuery, selectedChapterNumber]);

  useEffect(() => {
    if (!chaptersSource) {
      setCharactersByChapter({});
      return;
    }

    let cancelled = false;

    const loadAppearances = async () => {
      const map: CharacterAppearanceMap = {};
      await Promise.all(
        chaptersSource.map(async (chapter) => {
          try {
            const response = await fetch(chapter.url);
            const html = await response.text();
            map[chapter.chapterNumber] = parseCharacterSlugs(html);
          } catch {
            map[chapter.chapterNumber] = [];
          }
        }),
      );

      if (!cancelled) {
        setCharactersByChapter(map);
      }
    };

    loadAppearances();

    return () => {
      cancelled = true;
    };
  }, [chaptersSource]);

  useEffect(() => {
    if (!chapters.length) return;
    const current = chapters.find((chapter) => chapter.number === selectedChapterNumber);
    if (!current) {
      setSelectedChapterNumber(chapters[0].number);
      setSelectedPage(chapters[0].startPage);
    }
  }, [chapters, selectedChapterNumber, setSelectedChapterNumber, setSelectedPage]);

  const selectedChapter =
    chapters.find((chapter) => chapter.number === selectedChapterNumber) ??
    chapters[0] ??
    { number: 1, title: "Chapter 1", startPage: 1, endPage: 1 };

  const maxPage = pages.length ? pages[pages.length - 1] : 1;

  const handleChapterChange = (chapterNumber: number) => {
    const chapter = chapters.find((value) => value.number === chapterNumber);
    if (!chapter) return;
    setSelectedChapterNumber(chapterNumber);
    setSelectedPage(chapter.startPage);
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > maxPage) return;
    setSelectedPage(page);
    const chapter = chapters.find((value) => page >= value.startPage && page <= value.endPage);
    if (chapter && chapter.number !== selectedChapterNumber) {
      setSelectedChapterNumber(chapter.number);
    }
  };

  if (!bookPath) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Companion</Text>
        <Text style={styles.subtitle}>Start a scan session or set a book slug in Settings.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Companion</Text>
        <Text style={styles.headerSubtitle}>{companionBookSlug}</Text>
      </View>

      <View style={styles.selectionRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectionScroll}>
          {chapters.map((chapter) => (
            <Pressable
              key={chapter.number}
              style={[
                styles.selectionChip,
                chapter.number === selectedChapterNumber && styles.selectionChipActive,
              ]}
              onPress={() => handleChapterChange(chapter.number)}
            >
              <Text
                style={[
                  styles.selectionChipText,
                  chapter.number === selectedChapterNumber && styles.selectionChipTextActive,
                ]}
              >
                {chapter.number}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.pageSelector}>
          <Pressable style={styles.stepButton} onPress={() => handlePageChange(selectedPage - 1)}>
            <MaterialIcons name="remove" size={18} color="#111827" />
          </Pressable>
          <TextInput
            style={styles.pageInput}
            keyboardType="number-pad"
            value={String(selectedPage)}
            onChangeText={(value) => {
              const next = Number(value);
              if (!Number.isNaN(next)) handlePageChange(next);
            }}
          />
          <Pressable style={styles.stepButton} onPress={() => handlePageChange(selectedPage + 1)}>
            <MaterialIcons name="add" size={18} color="#111827" />
          </Pressable>
        </View>
      </View>

      <View style={styles.chapterInfo}>
        <Text style={styles.chapterTitle}>{selectedChapter.title}</Text>
        <Text style={styles.chapterPage}>Page {selectedPage}</Text>
      </View>

      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={18} color="#6b7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search characters"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.subtitle}>Loading book data...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCharacters}
          keyExtractor={(item) => item.slug}
          numColumns={3}
          columnWrapperStyle={styles.cardRow}
          contentContainerStyle={styles.cardGrid}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => setSelectedCharacter(item)}>
              <View style={[styles.avatar, { backgroundColor: item.color }]}
                >
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <MaterialIcons name={item.iconName} size={28} color="#fff" />
                )}
              </View>
              <Text style={styles.cardName} numberOfLines={2}>
                {item.name}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.subtitle}>No characters yet.</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!selectedCharacter} transparent animationType="slide" onRequestClose={() => setSelectedCharacter(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selectedCharacter ? (
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={[styles.modalAvatar, { backgroundColor: selectedCharacter.color }]}
                  >
                  {selectedCharacter.avatarUrl ? (
                    <Image source={{ uri: selectedCharacter.avatarUrl }} style={styles.modalAvatarImage} />
                  ) : (
                    <MaterialIcons name={selectedCharacter.iconName} size={48} color="#fff" />
                  )}
                </View>
                <Text style={styles.modalTitle}>{selectedCharacter.name}</Text>
                <Text style={styles.modalSectionLabel}>Summary</Text>
                <Text style={styles.modalText}>{selectedCharacter.globalSummary}</Text>

                <Text style={styles.modalSectionLabel}>This Chapter</Text>
                {selectedCharacter.chapterSummaries[selectedChapter.number]?.summary ? (
                  <Text style={styles.modalText}>
                    {selectedCharacter.chapterSummaries[selectedChapter.number].summary}
                  </Text>
                ) : (
                  <Text style={styles.modalTextMuted}>No chapter summary yet.</Text>
                )}

                <Text style={styles.modalSectionLabel}>Appearance</Text>
                {charactersByChapter[selectedChapter.number]?.includes(selectedCharacter.slug) ? (
                  <Text style={styles.modalText}>Appears in this chapter.</Text>
                ) : (
                  <Text style={styles.modalTextMuted}>Not mentioned in this chapter.</Text>
                )}
              </ScrollView>
            ) : null}
            <Pressable style={styles.modalClose} onPress={() => setSelectedCharacter(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function fuzzyMatch(token: string, target: string) {
  if (target.includes(token)) return true;
  let currentIndex = 0;
  for (const char of token) {
    const nextIndex = target.indexOf(char, currentIndex);
    if (nextIndex === -1) return false;
    currentIndex = nextIndex + 1;
  }
  return true;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingTop: 20,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  header: {
    paddingHorizontal: 20,
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6b7280",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  selectionRow: {
    marginTop: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  selectionScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  selectionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
  },
  selectionChipActive: {
    backgroundColor: "#2563eb",
  },
  selectionChipText: {
    color: "#111827",
    fontWeight: "600",
  },
  selectionChipTextActive: {
    color: "#ffffff",
  },
  pageSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  stepButton: {
    padding: 6,
  },
  pageInput: {
    minWidth: 48,
    textAlign: "center",
    fontWeight: "600",
    color: "#111827",
  },
  chapterInfo: {
    marginTop: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chapterTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  chapterPage: {
    fontSize: 13,
    color: "#6b7280",
  },
  searchRow: {
    marginTop: 12,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  cardGrid: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  cardRow: {
    justifyContent: "space-between",
  },
  card: {
    width: "30%",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 64,
    height: 64,
  },
  cardName: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    color: "#111827",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
  },
  modalContent: {
    padding: 20,
    gap: 12,
  },
  modalAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    overflow: "hidden",
  },
  modalAvatarImage: {
    width: 96,
    height: 96,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  modalText: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
  modalTextMuted: {
    fontSize: 14,
    color: "#9ca3af",
  },
  modalClose: {
    padding: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  modalCloseText: {
    fontWeight: "600",
    color: "#2563eb",
  },
});
