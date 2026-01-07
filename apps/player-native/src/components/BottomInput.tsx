import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Text,
  Keyboard,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
  Animated,
  Easing,
} from "react-native";
import { Send, Telescope, Loader2 } from "lucide-react-native";

import { useLocation } from "@player-native/contexts/LocationContext";
import { useBook } from "@player-native/contexts/BookContext";
import type { CharacterData } from "@player-native/types/book";

function hasReaderMetCharacter(
  character: CharacterData,
  chapter: number,
  paragraph: number,
): boolean {
  return character.infoPerChapter.some((info) => {
    const encounteredParagraphs = [
      ...info.paragraphsWhereSpotted,
      ...info.paragraphsWhereTalking,
      ...(info.paragraphsWhereEnters ?? []),
    ];

    if (info.chapter < chapter) {
      return encounteredParagraphs.length > 0;
    }

    if (info.chapter === chapter) {
      return encounteredParagraphs.some((p) => p <= paragraph);
    }

    return false;
  });
}

interface MentionState {
  isActive: boolean;
  query: string;
  startIndex: number;
}

interface BottomInputProps {
  onSearch?: (query: string) => void;
  onAsk?: (query: string) => void;
  onFocus?: () => void;
}

export function BottomInput({ onSearch, onAsk, onFocus }: BottomInputProps) {
  const [value, setValue] = useState("");
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [mentionState, setMentionState] = useState<MentionState>({
    isActive: false,
    query: "",
    startIndex: -1,
  });
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const spinValue = useRef(new Animated.Value(0)).current;
  const { location } = useLocation();
  const { charactersData } = useBook();

  useEffect(() => {
    if (isThinking) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [isThinking, spinValue]);

  const spin = spinValue.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const availableCharacters = useMemo(() => {
    return charactersData.filter((char) =>
      hasReaderMetCharacter(char, location.currentChapter, location.currentParagraph),
    );
  }, [charactersData, location.currentChapter, location.currentParagraph]);

  const filteredCharacters = useMemo(() => {
    if (!mentionState.isActive) return [];
    const query = mentionState.query.toLowerCase();
    return availableCharacters.filter((char) => char.characterName.toLowerCase().includes(query));
  }, [availableCharacters, mentionState.isActive, mentionState.query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [mentionState.query]);

  const handleTextChange = useCallback(
    (text: string) => {
      setValue(text);

      const textBeforeCursor = text.slice(0, cursorPosition + (text.length - value.length));
      const mentionMatch = textBeforeCursor.match(/(^|\s)@([^-@\s]*)$/);

      if (mentionMatch) {
        const query = mentionMatch[2];
        const atIndex = textBeforeCursor.length - query.length - 1;
        setMentionState({ isActive: true, query, startIndex: atIndex });
      } else if (mentionState.isActive) {
        setMentionState({ isActive: false, query: "", startIndex: -1 });
      }
    },
    [cursorPosition, value.length, mentionState.isActive],
  );

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setCursorPosition(e.nativeEvent.selection.start);
    },
    [],
  );

  const insertMention = useCallback(
    (characterName: string) => {
      if (!mentionState.isActive || mentionState.startIndex < 0) return;

      const mentionText = `@${characterName}`;
      const before = value.slice(0, mentionState.startIndex);
      const afterIndex = mentionState.startIndex + mentionState.query.length + 1;
      const after = value.slice(afterIndex);
      const newValue = `${before}${mentionText} ${after}`;

      setValue(newValue);
      setMentionState({ isActive: false, query: "", startIndex: -1 });

      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    },
    [mentionState, value],
  );

  const closeMentions = useCallback(() => {
    setMentionState({ isActive: false, query: "", startIndex: -1 });
    setHighlightedIndex(0);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;

    if (mentionState.isActive) {
      closeMentions();
    }

    setIsThinking(true);

    if (isDeepResearchActive) {
      onAsk?.(trimmed);
    } else {
      onSearch?.(trimmed);
    }

    setTimeout(() => {
      setIsThinking(false);
    }, 2000);

    Keyboard.dismiss();
  }, [
    value,
    isThinking,
    mentionState.isActive,
    closeMentions,
    isDeepResearchActive,
    onSearch,
    onAsk,
  ]);

  const toggleDeepResearch = useCallback(() => {
    if (isThinking) return;
    setIsDeepResearchActive((prev) => !prev);
  }, [isThinking]);

  const renderCharacterItem = useCallback(
    ({ item, index }: { item: CharacterData; index: number }) => (
      <TouchableOpacity
        onPress={() => insertMention(item.characterName)}
        style={[styles.mentionItem, index === highlightedIndex && styles.mentionItemHighlighted]}
        activeOpacity={0.7}
      >
        <Text style={styles.mentionItemText}>{item.characterName}</Text>
      </TouchableOpacity>
    ),
    [highlightedIndex, insertMention],
  );

  const placeholder = isThinking
    ? "Thinking..."
    : isDeepResearchActive
      ? "Ask a deep research question..."
      : "Search or ask...";

  const showSendButton = !isThinking && value.trim().length > 0;

  return (
    <View style={styles.container}>
      {mentionState.isActive && filteredCharacters.length > 0 && (
        <View style={styles.mentionsList}>
          <FlatList
            data={filteredCharacters}
            renderItem={renderCharacterItem}
            keyExtractor={(item) => item.slug}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {mentionState.isActive && filteredCharacters.length === 0 && (
        <View style={styles.mentionsListEmpty}>
          <Text style={styles.noCharactersText}>
            {availableCharacters.length === 0
              ? "No characters have been introduced yet."
              : "No matching characters found."}
          </Text>
        </View>
      )}

      <View
        style={[styles.inputContainer, isDeepResearchActive && styles.inputContainerDeepResearch]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleTextChange}
          onSelectionChange={handleSelectionChange}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor="rgba(255, 255, 255, 0.5)"
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isThinking}
        />

        <TouchableOpacity
          onPress={toggleDeepResearch}
          style={styles.iconButton}
          activeOpacity={0.7}
          disabled={isThinking}
        >
          <Telescope
            size={18}
            color={
              isDeepResearchActive
                ? "#fb923c"
                : isThinking
                  ? "rgba(255,255,255,0.3)"
                  : "rgba(255,255,255,0.7)"
            }
          />
        </TouchableOpacity>

        {isThinking ? (
          <Animated.View style={[styles.iconButton, { transform: [{ rotate: spin }] }]}>
            <Loader2 size={18} color="#60a5fa" />
          </Animated.View>
        ) : showSendButton ? (
          <TouchableOpacity onPress={handleSubmit} style={styles.iconButton} activeOpacity={0.7}>
            <Send size={18} color="#60a5fa" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8 },
  mentionsList: {
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 12,
    marginBottom: 8,
    maxHeight: 192,
    overflow: "hidden",
  },
  mentionsListEmpty: {
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  mentionItem: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "transparent" },
  mentionItemHighlighted: { backgroundColor: "rgba(255, 255, 255, 0.15)" },
  mentionItemText: { color: "#ffffff", fontSize: 16 },
  noCharactersText: { color: "rgba(255, 255, 255, 0.6)", fontSize: 14 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputContainerDeepResearch: { borderColor: "rgba(251, 146, 60, 0.5)" },
  input: { flex: 1, color: "#ffffff", fontSize: 16, paddingHorizontal: 8, paddingVertical: 4 },
  iconButton: { padding: 8, borderRadius: 20 },
});
