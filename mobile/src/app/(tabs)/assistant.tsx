import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ChatMessage, type RecommendedAction, useAIStore, useAuthStore } from "../../store";
import { colors, radius, spacing, typography } from "../../theme/theme";

// ── Message bubble ────────────────────────────────────────────────────────────

type BubbleProps = { message: ChatMessage; onFollowUp: (q: string) => void };

function MessageBubble({ message, onFollowUp }: BubbleProps) {
  const isUser = message.role === "user";
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visibleActions = message.recommended_actions.filter((a) => !dismissedIds.has(a.id));

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const handleReview = (action: RecommendedAction) => {
    const previewLines = Object.entries(action.payload_preview)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");
    Alert.alert(
      action.title,
      `${action.description}\n\nConfidence: ${Math.round(action.confidence * 100)}%\n\n${previewLines}`,
      [{ text: "Close" }],
    );
  };

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      {!isUser && (
        <View style={styles.avatarDot}>
          <Text style={styles.avatarDotText}>H</Text>
        </View>
      )}

      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
          {message.content}
        </Text>

        {/* Follow-up question chips */}
        {message.follow_up_questions.length > 0 && (
          <View style={styles.chipsSection}>
            <Text style={styles.chipsLabel}>ASK</Text>
            <View style={styles.chips}>
              {message.follow_up_questions.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={styles.followUpChip}
                  onPress={() => onFollowUp(q)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.followUpChipText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Suggested action chips */}
        {message.suggested_actions.length > 0 && (
          <View style={styles.chipsSection}>
            <Text style={styles.chipsLabel}>SUGGESTED</Text>
            <View style={styles.chips}>
              {message.suggested_actions.map((a) => (
                <View key={a} style={styles.actionChip}>
                  <Text style={styles.actionChipText}>{a}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recommended actions */}
        {visibleActions.length > 0 && (
          <View style={styles.recActionsSection}>
            <Text style={styles.chipsLabel}>RECOMMENDED ACTIONS</Text>
            {visibleActions.map((action) => (
              <View key={action.id} style={styles.recAction}>
                <View style={styles.recActionHeader}>
                  <Text style={styles.recActionTitle} numberOfLines={1}>{action.title}</Text>
                  <View style={styles.confidenceBadge}>
                    <Text style={styles.confidenceText}>{Math.round(action.confidence * 100)}%</Text>
                  </View>
                </View>
                <Text style={styles.recActionDesc}>{action.description}</Text>
                <View style={styles.recActionButtons}>
                  <TouchableOpacity
                    style={styles.reviewButton}
                    onPress={() => handleReview(action)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reviewButtonText}>REVIEW</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.notNowButton}
                    onPress={() => handleDismiss(action.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.notNowButtonText}>NOT NOW</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Provider badge — only shown on real OpenAI responses */}
        {message.provider && message.provider !== "mock" && (
          <Text style={styles.providerBadge}>via {message.provider}</Text>
        )}
      </View>
    </View>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
      <View style={styles.avatarDot}>
        <Text style={styles.avatarDotText}>H</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <ActivityIndicator size="small" color={colors.accentCyan} />
        <Text style={styles.typingText}>PROCESSING...</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { chatMessages, isChatLoading, chatError, sendMessage, clearChat } = useAIStore();

  const [input, setInput] = useState("");
  const [contextMode, setContextMode] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Scroll to bottom when messages change or typing indicator appears
  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [chatMessages.length, isChatLoading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !accessToken || isChatLoading) return;
    setInput("");
    await sendMessage(accessToken, {
      message: text,
      include_context: contextMode,
    });
  }, [input, accessToken, isChatLoading, contextMode, sendMessage]);

  const handleFollowUp = useCallback((question: string) => {
    setInput(question);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble message={item} onFollowUp={handleFollowUp} />
    ),
    [handleFollowUp],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>HELIOS ASSISTANT</Text>
          <Text style={styles.headerSub}>AI-powered intelligence layer</Text>
        </View>

        <View style={styles.headerActions}>
          {/* Context toggle */}
          <TouchableOpacity
            style={[styles.toggleButton, contextMode && styles.toggleButtonActive]}
            onPress={() => setContextMode((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleButtonText, contextMode && styles.toggleButtonTextActive]}>
              {contextMode ? "CONTEXT ON" : "CONTEXT"}
            </Text>
          </TouchableOpacity>

          {/* Clear conversation */}
          <TouchableOpacity onPress={clearChat} style={styles.clearButton} activeOpacity={0.7}>
            <Text style={styles.clearButtonText}>CLEAR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Context active banner */}
      {contextMode && (
        <View style={styles.contextBanner}>
          <View style={styles.contextBannerDot} />
          <Text style={styles.contextBannerText}>
            HELIOS context active — your goals and tasks are included in each message
          </Text>
        </View>
      )}

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={chatMessages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={isChatLoading ? <TypingIndicator /> : null}
      />

      {/* Error banner */}
      {chatError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{chatError}</Text>
        </View>
      ) : null}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask HELIOS anything..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          editable={!isChatLoading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || isChatLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || isChatLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  headerLabel: {
    ...typography.label,
    color: colors.accent,
  },

  headerSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  toggleButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  toggleButtonActive: {
    borderColor: colors.accentCyan,
    backgroundColor: "rgba(34,211,238,0.1)",
  },

  toggleButtonText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
  },

  toggleButtonTextActive: {
    color: colors.accentCyan,
  },

  clearButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  clearButtonText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
  },

  // Context banner
  contextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(34,211,238,0.06)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(34,211,238,0.2)",
  },

  contextBannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentCyan,
    flexShrink: 0,
  },

  contextBannerText: {
    ...typography.caption,
    color: colors.accentCyan,
    opacity: 0.85,
    flex: 1,
  },

  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },

  // Bubble rows
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },

  bubbleRowUser: {
    justifyContent: "flex-end",
  },

  bubbleRowAssistant: {
    justifyContent: "flex-start",
  },

  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  avatarDotText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },

  bubble: {
    maxWidth: "80%",
    borderRadius: radius.md,
    padding: spacing.md,
  },

  bubbleUser: {
    backgroundColor: colors.accent,
  },

  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  bubbleText: {
    ...typography.body,
    lineHeight: 22,
  },

  bubbleTextUser: {
    color: colors.textPrimary,
  },

  bubbleTextAssistant: {
    color: colors.textPrimary,
  },

  // Chips
  chipsSection: {
    marginTop: spacing.sm,
  },

  chipsLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    marginBottom: spacing.xs,
  },

  chips: {
    gap: spacing.xs,
  },

  followUpChip: {
    backgroundColor: "rgba(124,58,237,0.15)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.4)",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },

  followUpChipText: {
    ...typography.caption,
    color: "#a78bfa",
  },

  actionChip: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },

  actionChipText: {
    ...typography.caption,
    color: colors.textMuted,
  },

  providerBadge: {
    ...typography.caption,
    color: colors.accentCyan,
    fontSize: 10,
    marginTop: spacing.xs,
    opacity: 0.7,
  },

  // Typing
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },

  typingText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
  },

  // Error
  errorBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    borderRadius: radius.sm,
    padding: spacing.sm,
  },

  errorText: {
    ...typography.caption,
    color: "#ef4444",
  },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },

  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textPrimary,
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    minHeight: 44,
  },

  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentCyan,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  sendButtonDisabled: {
    opacity: 0.35,
  },

  sendIcon: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.background,
  },

  // Recommended actions
  recActionsSection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },

  recAction: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.xs,
  },

  recActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },

  recActionTitle: {
    ...typography.body,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    flex: 1,
    fontSize: 13,
  },

  confidenceBadge: {
    backgroundColor: "rgba(34,211,238,0.15)",
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },

  confidenceText: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 10,
  },

  recActionDesc: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 17,
  },

  recActionButtons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 2,
  },

  reviewButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.accentCyan,
  },

  reviewButtonText: {
    ...typography.label,
    color: colors.background,
    fontSize: 10,
    fontWeight: "700" as const,
  },

  notNowButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  notNowButtonText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
  },
});
