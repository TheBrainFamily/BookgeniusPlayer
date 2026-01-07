import { useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from "react-native";
import { X } from "lucide-react-native";

import { useSearchModal, type SearchResultItem } from "@player-native/stores/searchModal.store";

interface SearchModalProps {
  onNavigate: (chapter: number, paragraph: number) => void;
}

/**
 * SearchModal displays search results and allows navigation to specific paragraphs.
 */
export function SearchModal({ onNavigate }: SearchModalProps) {
  const { isOpen, query, results, closeModal } = useSearchModal();

  const handleResultPress = useCallback(
    (item: SearchResultItem) => {
      onNavigate(item.chapter, item.paragraph);
      closeModal();
    },
    [onNavigate, closeModal],
  );

  const renderResultItem = useCallback(
    ({ item }: { item: SearchResultItem }) => (
      <TouchableOpacity
        onPress={() => handleResultPress(item)}
        style={styles.resultItem}
        activeOpacity={0.7}
      >
        <View style={styles.resultMeta}>
          <Text style={styles.resultMetaText}>
            Chapter {item.chapter}, Paragraph {item.paragraph}
          </Text>
        </View>
        <Text style={styles.resultSummary} numberOfLines={3}>
          {item.summary}
        </Text>
      </TouchableOpacity>
    ),
    [handleResultPress],
  );

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={closeModal}>
      <Pressable style={styles.overlay} onPress={closeModal}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Search Results</Text>
              {query && <Text style={styles.subtitle}>Searching for "{query}"</Text>}
            </View>
            <TouchableOpacity onPress={closeModal} style={styles.closeButton} activeOpacity={0.7}>
              <X size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {results.isLoading ? (
              <View style={styles.centerContent}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.loadingText}>Searching...</Text>
              </View>
            ) : results.items.length === 0 ? (
              <View style={styles.centerContent}>
                <Text style={styles.emptyText}>{results.header || "No results found."}</Text>
              </View>
            ) : (
              <>
                {results.header && (
                  <View style={styles.resultsHeader}>
                    <Text style={styles.resultsHeaderText}>{results.header}</Text>
                  </View>
                )}
                <FlatList
                  data={results.items}
                  renderItem={renderResultItem}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.listContent}
                />
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" },
  container: {
    flex: 1,
    marginTop: 80,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
  },
  headerText: { flex: 1 },
  title: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  subtitle: { color: "rgba(255, 255, 255, 0.6)", fontSize: 14, marginTop: 4 },
  closeButton: { padding: 8 },
  content: { flex: 1 },
  centerContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  loadingText: { color: "rgba(255, 255, 255, 0.6)", marginTop: 16 },
  emptyText: { color: "rgba(255, 255, 255, 0.6)", textAlign: "center" },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  resultsHeaderText: { color: "rgba(255, 255, 255, 0.8)", fontSize: 14 },
  listContent: { paddingBottom: 100 },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  resultMeta: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  resultMetaText: { color: "rgba(255, 255, 255, 0.6)", fontSize: 12 },
  resultSummary: { color: "#ffffff", fontSize: 14 },
});
