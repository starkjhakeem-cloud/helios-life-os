import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type ChatMessage,
  type ConversationSummary,
  useAuthStore,
  useConversationStore,
} from "../../store";
import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

// Must match tabBarStyle.height in (tabs)/_layout.tsx.
// The tab bar is position:absolute so it overlays screen content —
// we shift the composer up by this amount so it sits above the bar.
const TAB_BAR_HEIGHT = 106;

const WELCOME: ChatMessage = {
  id: "helios-welcome",
  role: "assistant",
  content:
    "Operator online. I am HELIOS — your AI life-operating system. " +
    "I can assist with goal strategy, task prioritization, execution planning, and performance analytics. " +
    "What would you like to work on?",
  suggested_actions: [],
  follow_up_questions: [],
  recommended_actions: [],
  timestamp: new Date().toISOString(),
};

// ── Message bubble ────────────────────────────────────────────────────────────

type BubbleProps = {
  message: ChatMessage;
};

function MessageBubble({ message }: BubbleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUser = message.role === "user";

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
      </View>
    </View>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

// ── History modal ─────────────────────────────────────────────────────────────

type HistoryModalProps = {
  visible: boolean;
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  isLoadingHistory: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
};

function HistoryModal({
  visible,
  conversations,
  currentConversationId,
  isLoadingHistory,
  onClose,
  onSelect,
  onNew,
}: HistoryModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modalCard, styles.historyCard]}>

              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>CONVERSATION HISTORY</Text>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                  <Text style={styles.historyClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.newConvButton}
                onPress={() => { onNew(); onClose(); }}
                activeOpacity={0.8}
              >
                <Text style={styles.newConvButtonText}>+ NEW CONVERSATION</Text>
              </TouchableOpacity>

              {isLoadingHistory && (
                <View style={styles.historyLoading}>
                  <ActivityIndicator size="small" color={colors.accentCyan} />
                </View>
              )}

              {!isLoadingHistory && conversations.length === 0 && (
                <View style={styles.historyEmpty}>
                  <Text style={styles.historyEmptyText}>No conversations yet.</Text>
                </View>
              )}

              {!isLoadingHistory && conversations.length > 0 && (
                <ScrollView
                  style={styles.historyList}
                  showsVerticalScrollIndicator={false}
                >
                  {conversations.map((conv) => {
                    const isCurrent = conv.id === currentConversationId;
                    return (
                      <TouchableOpacity
                        key={conv.id}
                        style={[styles.historyRow, isCurrent && styles.historyRowActive]}
                        onPress={() => { onSelect(conv.id); onClose(); }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.historyRowBody}>
                          <Text style={[styles.historyRowTitle, isCurrent && styles.historyRowTitleActive]} numberOfLines={1}>
                            {conv.title}
                          </Text>
                          <Text style={styles.historyRowMeta}>
                            {conv.message_count} {conv.message_count === 1 ? "message" : "messages"} · {formatDate(conv.updated_at)}
                          </Text>
                        </View>
                        {isCurrent && <View style={styles.historyActiveDot} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AssistantScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);

  const {
    currentConversationId,
    currentConversationTitle,
    currentMessages,
    conversations,
    isInitializing,
    isSending,
    isLoadingHistory,
    initError,
    sendError,
    initializeConversation,
    createNewConversation,
    loadConversation,
    fetchConversations,
    sendMessage,
  } = useConversationStore();

  const [input, setInput] = useState("");
  const [contextMode, setContextMode] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Initialize conversation on mount
  useEffect(() => {
    if (accessToken) {
      initializeConversation(accessToken);
    }
  }, [accessToken]);

  // Scroll to bottom when messages change or typing indicator appears.
  // We check currentMessages.length (not displayMessages) since displayMessages
  // is derived below and always has at least the welcome message.
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [currentMessages.length, isSending]);

  // Refresh conversation list when history modal opens
  useEffect(() => {
    if (historyVisible && accessToken) {
      fetchConversations(accessToken);
    }
  }, [historyVisible]);

  // Central send function used by both the input bar and the follow-up chips.
  // Auto-initialises the conversation if it doesn't exist yet so chips work
  // even before the backend round-trip on mount completes.
  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !accessToken || isSending || isInitializing) return;
    setInput("");

    // If there's no conversation yet, create one before sending.
    if (!currentConversationId) {
      await initializeConversation(accessToken);
      // getState() reads the latest Zustand state after the async call.
      if (!useConversationStore.getState().currentConversationId) return;
    }

    await sendMessage(accessToken, {
      message: trimmed,
      include_context: contextMode,
    });
  }, [accessToken, isSending, isInitializing, currentConversationId, contextMode, initializeConversation, sendMessage]);

  const handleSend = useCallback(() => {
    sendText(input);
  }, [input, sendText]);

  const handleNewConversation = useCallback(() => {
    if (accessToken) createNewConversation(accessToken);
  }, [accessToken, createNewConversation]);

  const handleSelectConversation = useCallback((id: string) => {
    if (accessToken) loadConversation(accessToken, id);
  }, [accessToken, loadConversation]);

  const handleRetryInit = useCallback(() => {
    if (accessToken) initializeConversation(accessToken);
  }, [accessToken, initializeConversation]);

  // Show welcome message when conversation is empty
  const displayMessages: ChatMessage[] =
    currentMessages.length === 0 ? [WELCOME] : currentMessages;

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble message={item} />
    ),
    [],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const isInputDisabled = isSending || isInitializing;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? TAB_BAR_HEIGHT : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>HELIOS ASSISTANT</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {currentConversationTitle || "AI-powered intelligence layer"}
          </Text>
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

          {/* History */}
          <TouchableOpacity
            onPress={() => setHistoryVisible(true)}
            style={styles.headerIconButton}
            activeOpacity={0.7}
          >
            <Text style={styles.headerIconButtonText}>HISTORY</Text>
          </TouchableOpacity>

          {/* New conversation */}
          <TouchableOpacity
            onPress={handleNewConversation}
            style={styles.headerIconButton}
            activeOpacity={0.7}
            disabled={isInitializing}
          >
            <Text style={[styles.headerIconButtonText, isInitializing && { opacity: 0.4 }]}>NEW</Text>
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

      {/* Inline init banner — compact, doesn't hide the chat */}
      {isInitializing && (
        <View style={styles.initBanner}>
          <ActivityIndicator size="small" color={colors.accentCyan} />
          <Text style={styles.initBannerText}>CONNECTING…</Text>
        </View>
      )}

      {/* Inline init error banner with retry — chat still usable beneath it */}
      {!isInitializing && initError && (
        <View style={styles.initErrorBanner}>
          <Text style={styles.initErrorText} numberOfLines={2}>{initError}</Text>
          <TouchableOpacity onPress={handleRetryInit} activeOpacity={0.8}>
            <Text style={styles.initErrorRetry}>RETRY</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message list — always visible so the user can read history and type */}
      <FlatList
        ref={listRef}
        data={displayMessages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={styles.messageList}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={isSending ? <TypingIndicator /> : null}
      />

      {/* Send error banner */}
      {sendError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{sendError}</Text>
        </View>
      ) : null}

      {/* Input bar — sits above the absolute-positioned tab bar via marginBottom */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask anything"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          editable={!isInputDisabled}
        />
        <TouchableOpacity
          style={[styles.sendButton, (isInputDisabled || !input.trim()) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={isInputDisabled || !input.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>

      {/* Conversation history modal */}
      <HistoryModal
        visible={historyVisible}
        conversations={conversations}
        currentConversationId={currentConversationId}
        isLoadingHistory={isLoadingHistory}
        onClose={() => setHistoryVisible(false)}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
      />
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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

  headerLeft: {
    flex: 1,
    marginRight: spacing.sm,
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
    flexShrink: 0,
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
    backgroundColor: `${colors.accentCyan}1a`,
  },

  toggleButtonText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
  },

  toggleButtonTextActive: {
    color: colors.accentCyan,
  },

  headerIconButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  headerIconButtonText: {
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
    backgroundColor: `${colors.accentCyan}0f`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.accentCyan}33`,
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

  // Inline init/error banners — compact strips that don't hide the chat
  initBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: `${colors.accentCyan}0d`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.accentCyan}26`,
  },

  initBannerText: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 10,
    opacity: 0.8,
  },

  initErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: `${colors.danger}14`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.danger}40`,
  },

  initErrorText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },

  initErrorRetry: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 10,
    flexShrink: 0,
  },

  // flex:1 ensures the list takes exactly the remaining space, letting the
  // input bar stay at the bottom rather than being pushed off screen.
  messageList: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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
    backgroundColor: `${colors.danger}1a`,
    borderWidth: 1,
    borderColor: `${colors.danger}4d`,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },

  errorText: {
    ...typography.caption,
    color: colors.danger,
  },

  // Input bar — marginBottom lifts it above the absolute-positioned tab bar (106px).
  // keyboardVerticalOffset on the KAV is set to the same value so that when the
  // keyboard opens, the bar lands exactly at the keyboard top (no gap, no overlap).
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: TAB_BAR_HEIGHT,
  },

  textInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: `${colors.accent}8c`,
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
    backgroundColor: colors.accent,
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

  // ── Modal overlay & card ──────────────────────────────────────────────────

  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },

  modalCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },

  // ── History modal ─────────────────────────────────────────────────────────

  historyCard: {
    maxHeight: "80%",
    padding: 0,
    overflow: "hidden",
  },

  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  historyTitle: {
    ...typography.label,
    color: colors.accent,
  },

  historyClose: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 16,
  },

  newConvButton: {
    margin: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentCyan,
    alignItems: "center",
  },

  newConvButtonText: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 11,
  },

  historyList: {
    maxHeight: 360,
  },

  historyLoading: {
    padding: spacing.xl,
    alignItems: "center",
  },

  historyEmpty: {
    padding: spacing.xl,
    alignItems: "center",
  },

  historyEmptyText: {
    ...typography.body,
    color: colors.textMuted,
  },

  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  historyRowActive: {
    backgroundColor: `${colors.accent}14`,
  },

  historyRowBody: {
    flex: 1,
    gap: 3,
  },

  historyRowTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14,
  },

  historyRowTitleActive: {
    color: colors.accent,
  },

  historyRowMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },

  historyActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  });
}
