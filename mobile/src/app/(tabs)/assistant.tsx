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

import ActionReviewModal from "../../components/ActionReviewModal";
import {
  type ChatMessage,
  type ConversationSummary,
  type RecommendedAction,
  useAuthStore,
  useConversationStore,
} from "../../store";
import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

const WELCOME: ChatMessage = {
  id: "helios-welcome",
  role: "assistant",
  content:
    "Operator online. I am HELIOS — your AI life-operating system. " +
    "I can assist with goal strategy, task prioritization, execution planning, and performance analytics. " +
    "What would you like to work on?",
  suggested_actions: [],
  follow_up_questions: [
    "What should I focus on today?",
    "Help me plan my next goal.",
    "How is my progress this week?",
  ],
  recommended_actions: [],
  timestamp: new Date().toISOString(),
};

// ── Message bubble ────────────────────────────────────────────────────────────

type BubbleProps = {
  message: ChatMessage;
  onFollowUp: (q: string) => void;
  onReview: (action: RecommendedAction) => void;
  acknowledgedIds: Set<string>;
};

function MessageBubble({ message, onFollowUp, onReview, acknowledgedIds }: BubbleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUser = message.role === "user";
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visibleActions = message.recommended_actions.filter((a) => !dismissedIds.has(a.id));

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
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
            {visibleActions.map((action) => {
              const isAcknowledged = acknowledgedIds.has(action.id);
              return (
                <View
                  key={action.id}
                  style={[styles.recAction, isAcknowledged && styles.recActionAcknowledged]}
                >
                  <View style={styles.recActionHeader}>
                    <Text style={styles.recActionTitle} numberOfLines={1}>{action.title}</Text>
                    <View style={styles.confidenceBadge}>
                      <Text style={styles.confidenceText}>{Math.round(action.confidence * 100)}%</Text>
                    </View>
                  </View>
                  <Text style={styles.recActionDesc}>{action.description}</Text>

                  {isAcknowledged ? (
                    <View style={styles.acknowledgedRow}>
                      <Text style={styles.acknowledgedText}>✓ ACKNOWLEDGED</Text>
                    </View>
                  ) : (
                    <View style={styles.recActionButtons}>
                      <TouchableOpacity
                        style={styles.reviewButton}
                        onPress={() => onReview(action)}
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
                  )}
                </View>
              );
            })}
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
  const [reviewingAction, setReviewingAction] = useState<RecommendedAction | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [historyVisible, setHistoryVisible] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Initialize conversation on mount
  useEffect(() => {
    if (accessToken) {
      initializeConversation(accessToken);
    }
  }, [accessToken]);

  // Scroll to bottom when messages change or typing indicator appears
  useEffect(() => {
    if (displayMessages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [currentMessages.length, isSending]);

  // Refresh conversation list when history modal opens
  useEffect(() => {
    if (historyVisible && accessToken) {
      fetchConversations(accessToken);
    }
  }, [historyVisible]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !accessToken || isSending || !currentConversationId) return;
    setInput("");
    await sendMessage(accessToken, {
      message: text,
      include_context: contextMode,
    });
  }, [input, accessToken, isSending, currentConversationId, contextMode, sendMessage]);

  const handleFollowUp = useCallback((question: string) => {
    setInput(question);
  }, []);

  const handleReview = useCallback((action: RecommendedAction) => {
    setReviewingAction(action);
  }, []);

  const handleAcknowledge = useCallback((id: string) => {
    setAcknowledgedIds((prev) => new Set(prev).add(id));
    setReviewingAction(null);
  }, []);

  const handleCancelReview = useCallback(() => {
    setReviewingAction(null);
  }, []);

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
      <MessageBubble
        message={item}
        onFollowUp={handleFollowUp}
        onReview={handleReview}
        acknowledgedIds={acknowledgedIds}
      />
    ),
    [handleFollowUp, handleReview, acknowledgedIds],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const isInputDisabled = isSending || isInitializing || !!initError || !currentConversationId;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
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

      {/* Initializing state */}
      {isInitializing && (
        <View style={styles.centeredState}>
          <ActivityIndicator color={colors.accentCyan} />
          <Text style={styles.centeredStateText}>CONNECTING...</Text>
        </View>
      )}

      {/* Init error state */}
      {!isInitializing && initError && (
        <View style={styles.centeredState}>
          <Text style={styles.centeredErrorText}>{initError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetryInit} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message list */}
      {!isInitializing && !initError && (
        <FlatList
          ref={listRef}
          data={displayMessages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={isSending ? <TypingIndicator /> : null}
        />
      )}

      {/* Send error banner */}
      {sendError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{sendError}</Text>
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

      {/* Action review modal — rendered at screen level so it overlays everything */}
      <ActionReviewModal
        action={reviewingAction}
        onConfirm={handleAcknowledge}
        onCancel={handleCancelReview}
      />

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

  // Centered states (initializing / error)
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },

  centeredStateText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 11,
  },

  centeredErrorText: {
    ...typography.body,
    color: "#ef4444",
    textAlign: "center",
    lineHeight: 22,
  },

  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentCyan,
  },

  retryButtonText: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 11,
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

  recActionAcknowledged: {
    opacity: 0.55,
  },

  acknowledgedRow: {
    marginTop: 2,
  },

  acknowledgedText: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 10,
  },

  // ── Modal overlay & card ──────────────────────────────────────────────────

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(5,8,22,0.85)",
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
    backgroundColor: "rgba(124,58,237,0.08)",
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
