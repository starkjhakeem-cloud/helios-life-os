import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
import { SymbolView } from "expo-symbols";

import {
  type ChatMessage,
  type ConversationSummary,
  useAuthStore,
  useConversationStore,
  useProfileStore,
  useSettingsStore,
} from "../../store";
import type { RecommendedAction } from "../../store/useAIStore";
import { radius, spacing, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import HeliosEnergyCore from "../../components/HeliosEnergyCore";

// Pill row height + float offset + visual buffer (device-agnostic part).
// Add insets.bottom at runtime for the safe-area portion.
const NAV_PILL_STATIC = 82 + 10 + 14;
const ORBS_MSG_SIZE     = 32;
const ORBS_WELCOME_SIZE = 48;

// ── Suggested Prompts ─────────────────────────────────────────────────────────
// Generic, not user-specific — hide once conversation begins.

const SUGGESTED_PROMPTS = [
  { icon: "calendar",                   text: "Plan my day" },
  { icon: "envelope.fill",              text: "Summarize today's emails" },
  { icon: "calendar.badge.clock",       text: "What's on my calendar?" },
  { icon: "target",                     text: "Review my goals" },
  { icon: "arrow.forward.circle.fill",  text: "What should I work on next?" },
  { icon: "sparkles",                   text: "Generate today's Daily Brief" },
];

// ── AI Status ─────────────────────────────────────────────────────────────────

type AIStatus = "ready" | "connecting" | "thinking" | "error";

const AI_STATUS_CONFIG: Record<AIStatus, { label: string; color: string }> = {
  ready:      { label: "Ready",       color: "#22c55e" },
  connecting: { label: "Connecting",  color: "#22d3ee" },
  thinking:   { label: "Thinking",    color: "#f59e0b" },
  error:      { label: "Unavailable", color: "#ef4444" },
};

// ── Attachment type stubs (no-op; architecture prep only) ─────────────────────

type AttachmentType = "image" | "pdf" | "voice" | "file";

// ── Message delivery status ───────────────────────────────────────────────────
// Future states: "sending" | "failed" | "retry" | "synced"
type MessageStatus = "sent";

function MessageStatusIcon({ status, colors }: { status: MessageStatus; colors: ThemeColors }) {
  const icons: Record<MessageStatus, string> = { sent: "✓" };
  return <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 3 }}>{icons[status]}</Text>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getWelcomeQuestion() {
  const h = new Date().getHours();
  if (h < 12) return "How can I help you this morning?";
  if (h < 17) return "How can I help you today?";
  return "How can I help you tonight?";
}

function deriveAIStatus(
  isInitializing: boolean,
  isSending: boolean,
  hasError: boolean,
): AIStatus {
  if (hasError)      return "error";
  if (isInitializing) return "connecting";
  if (isSending)     return "thinking";
  return "ready";
}

// Maps raw backend/network errors to calm, user-facing messages.
function friendlyError(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("backend unavailable") || lower.includes("current api:")) return raw;
  if (/network|fetch|connection|offline|unreachable|failed to/.test(lower))
    return "Unable to reach HELIOS. Check your connection and try again.";
  if (/401|unauthorized|expired|session/.test(lower))
    return "Your session expired. Please sign in again.";
  if (/timeout|timed out/.test(lower))
    return "HELIOS took too long to respond. Try again.";
  if (/503|502|unavailable|maintenance/.test(lower))
    return "HELIOS AI is temporarily unavailable.";
  if (/429|rate.?limit/.test(lower))
    return "HELIOS is busy right now. Try again in a moment.";
  return "Something went wrong. Please try again.";
}

// ── Animated Dots (typing indicator) ─────────────────────────────────────────

function AnimatedDots({ colors }: { colors: ThemeColors }) {
  const dot0 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeDot = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(480 - delay),
        ])
      );

    const a0 = makeDot(dot0, 0);
    const a1 = makeDot(dot1, 160);
    const a2 = makeDot(dot2, 320);
    a0.start(); a1.start(); a2.start();
    return () => { a0.stop(); a1.stop(); a2.stop(); };
  }, [dot0, dot1, dot2]);

  const dotStyle = (anim: Animated.Value) => ({
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.accentCyan,
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.2] }) }],
  });

  return (
    <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
      <Animated.View style={dotStyle(dot0)} />
      <Animated.View style={dotStyle(dot1)} />
      <Animated.View style={dotStyle(dot2)} />
    </View>
  );
}

// ── Streaming Cursor ──────────────────────────────────────────────────────────

function StreamingCursor({ colors }: { colors: ThemeColors }) {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
    return () => blink.stopAnimation();
  }, [blink]);

  return (
    <Animated.Text
      style={{ opacity: blink, color: colors.accentCyan, fontWeight: "600", fontSize: 15 }}
    >
      |
    </Animated.Text>
  );
}

// ── Header Icon Button ────────────────────────────────────────────────────────

function HeaderIconButton({
  icon,
  label,
  active,
  onPress,
  colors,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={s.iconBtn}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View style={[s.iconBtnCircle, active && s.iconBtnCircleActive]}>
        <SymbolView
          name={icon as any}
          size={18}
          tintColor={active ? colors.accent : colors.textMuted}
          resizeMode="scaleAspectFit"
        />
      </View>
      <Text style={[s.iconBtnLabel, active && s.iconBtnLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function AssistantHeader({
  aiStatus,
  onHistoryPress,
  onNewPress,
  colors,
}: {
  aiStatus: AIStatus;
  onHistoryPress: () => void;
  onNewPress: () => void;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createStyles(colors), [colors]);
  const { label, color } = AI_STATUS_CONFIG[aiStatus];

  return (
    <View style={s.header}>
      {/* Far left — Energy Core orb */}
      <View style={s.headerOrbWrap} pointerEvents="none">
        <HeliosEnergyCore size={72} interactive={false} />
      </View>

      {/* Title */}
      <View style={s.headerLeft}>
        <Text style={s.headerHELIOS}>HELIOS</Text>
        <View style={s.headerSubRow}>
          <Text style={s.headerAssistant}>Assistant</Text>
          <View style={[s.onlineDot, { backgroundColor: color }]} />
          <Text style={[s.headerOnline, { color }]}>{label}</Text>
        </View>
      </View>

      {/* Right — icon action buttons */}
      <View style={s.headerRight}>
        <HeaderIconButton icon="clock"     label="History"  onPress={onHistoryPress} colors={colors} />
        <HeaderIconButton icon="sparkles"  label="New Chat" onPress={onNewPress}     colors={colors} />
      </View>
    </View>
  );
}

// ── Welcome Card ──────────────────────────────────────────────────────────────

function WelcomeCard({ displayName, colors }: { displayName: string; colors: ThemeColors }) {
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={s.welcomeCard}>
      <View style={s.welcomeOrbWrap} pointerEvents="none">
        <HeliosEnergyCore size={ORBS_WELCOME_SIZE} interactive={false} />
      </View>
      <Text style={s.welcomeGreeting}>{getTimeGreeting()}, {displayName}.</Text>
      <Text style={s.welcomeQuestion}>{getWelcomeQuestion()}</Text>
    </View>
  );
}

// ── Suggested Prompts ─────────────────────────────────────────────────────────

function SuggestedPromptChip({
  item,
  onPress,
  colors,
}: {
  item: typeof SUGGESTED_PROMPTS[0];
  onPress: (text: string) => void;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={s.promptChip}
      onPress={() => onPress(item.text)}
      activeOpacity={0.75}
      accessibilityLabel={item.text}
      accessibilityRole="button"
    >
      <SymbolView name={item.icon as any} size={13} tintColor={colors.accent} resizeMode="scaleAspectFit" />
      <Text style={s.promptChipText}>{item.text}</Text>
    </TouchableOpacity>
  );
}

function SuggestedPrompts({ onAction, colors }: { onAction: (t: string) => void; colors: ThemeColors }) {
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={s.promptsSection}>
      <Text style={s.promptsLabel}>SUGGESTED</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        keyboardShouldPersistTaps="handled"
      >
        {SUGGESTED_PROMPTS.map((p) => (
          <SuggestedPromptChip key={p.text} item={p} onPress={onAction} colors={colors} />
        ))}
      </ScrollView>
    </View>
  );
}

// ── User Bubble ───────────────────────────────────────────────────────────────

function UserBubble({ message, colors }: { message: ChatMessage; colors: ThemeColors }) {
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={s.userRow} accessibilityLabel={`You: ${message.content}`}>
      <View style={s.userBubble}>
        <Text style={s.userText}>{message.content}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={s.msgTimestamp}>{formatTime(message.timestamp)}</Text>
        <MessageStatusIcon status="sent" colors={colors} />
      </View>
    </View>
  );
}

// ── Stats Row (inside HELIOS bubble when recommended_actions present) ─────────

function StatsRow({ action, colors }: { action: RecommendedAction; colors: ThemeColors }) {
  const s = useMemo(() => createStyles(colors), [colors]);
  const pct = Math.round(action.confidence * 100);
  const impact = pct >= 90 ? "High" : pct >= 70 ? "Medium" : "Low";
  const preview = action.payload_preview as Record<string, unknown> | undefined;
  const estTime = (preview?.estimated_time as string | undefined) ?? "1h 45m";

  return (
    <View style={s.statsRow}>
      <View style={s.statItem}>
        <Text style={s.statLabel}>ESTIMATED{"\n"}STUDY TIME</Text>
        <View style={s.statValueRow}>
          <SymbolView name="clock" size={11} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
          <Text style={[s.statValue, { fontSize: 13 }]}>{estTime}</Text>
        </View>
      </View>
      <View style={s.statDivider} />
      <View style={s.statItem}>
        <Text style={s.statLabel}>CONFIDENCE</Text>
        <View style={s.statValueRow}>
          <SymbolView name="waveform.path.ecg" size={11} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
          <Text style={s.statValue}>{pct}%</Text>
        </View>
      </View>
      <View style={s.statDivider} />
      <View style={s.statItem}>
        <Text style={s.statLabel}>IMPACT</Text>
        <View style={s.statValueRow}>
          <SymbolView name="target" size={11} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
          <Text style={s.statValue}>{impact}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Recommended Action Panel (inside HELIOS bubble) ───────────────────────────

function ActionPanel({
  action,
  expanded,
  onToggle,
  onPress,
  colors,
}: {
  action: RecommendedAction;
  expanded: boolean;
  onToggle: () => void;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createStyles(colors), [colors]);
  const btnLabel =
    action.type === "create_task"   ? "Create Task"   :
    action.type === "create_goal"   ? "Create Goal"   :
    action.type === "generate_plan" ? "Generate Plan" : "Start Action";

  return (
    <View style={s.actionPanel}>
      <Text style={s.actionPanelLabel}>RECOMMENDED NEXT ACTION</Text>
      <View style={s.actionPanelBody}>
        <Text style={s.actionPanelTitle} numberOfLines={2}>{action.title}</Text>
        <TouchableOpacity style={s.actionPanelBtn} onPress={onPress} activeOpacity={0.8}>
          <Text style={s.actionPanelBtnText}>{btnLabel}</Text>
          <SymbolView name="chevron.right" size={10} tintColor={colors.textPrimary} resizeMode="scaleAspectFit" />
        </TouchableOpacity>
      </View>
      {expanded && <Text style={s.actionPanelDesc}>{action.description}</Text>}
      <TouchableOpacity style={s.whyRow} onPress={onToggle} activeOpacity={0.7}>
        <Text style={s.whyText}>Why this recommendation?</Text>
        <SymbolView
          name={expanded ? "chevron.up" : "chevron.down"}
          size={10}
          tintColor={colors.textMuted}
          resizeMode="scaleAspectFit"
        />
      </TouchableOpacity>
    </View>
  );
}

// ── In-bubble action pill ─────────────────────────────────────────────────────

function inferActionIcon(text: string): string {
  const t = text.toLowerCase();
  if (/study|course|d278|learn|chapter|session/.test(t)) return "book.fill";
  if (/goal/.test(t)) return "target";
  if (/plan|schedule|tomorrow/.test(t)) return "calendar";
  if (/task|complete|finish/.test(t)) return "checkmark.circle.fill";
  if (/summarize|summary/.test(t)) return "chart.line.uptrend.xyaxis";
  return "arrow.forward.circle.fill";
}

function InBubbleActionPill({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity style={s.inBubblePill} onPress={onPress} activeOpacity={0.8}
      accessibilityLabel={label} accessibilityRole="button">
      <View style={s.inBubblePillIcon}>
        <SymbolView name={inferActionIcon(label) as any} size={13} tintColor={colors.accent} resizeMode="scaleAspectFit" />
      </View>
      <Text style={s.inBubblePillText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Context Source Chips (renders only when backend provides context_sources) ──

function ContextSourceChips({ sources, colors }: { sources: string[]; colors: ThemeColors }) {
  const s = useMemo(() => createStyles(colors), [colors]);
  if (sources.length === 0) return null;
  return (
    <View style={s.ctxChipsRow}>
      <Text style={s.ctxChipsLabel}>CONTEXT USED</Text>
      {sources.map((src) => (
        <View key={src} style={s.ctxChip}>
          <Text style={s.ctxChipText}>{src}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Assistant Bubble ──────────────────────────────────────────────────────────

function AssistantBubble({
  message,
  expandedId,
  onToggleExpand,
  onChipPress,
  colors,
}: {
  message: ChatMessage;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onChipPress: (text: string) => void;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createStyles(colors), [colors]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const topAction     = message.recommended_actions?.[0] ?? null;
  const suggestedList = message.suggested_actions;
  const followUpList  = message.follow_up_questions;
  const isExpanded    = expandedId === message.id;

  const inBubblePill  = !topAction && suggestedList.length > 0 ? suggestedList[0] : null;
  const externalChips = topAction
    ? (suggestedList.length > 0 ? suggestedList : followUpList)
    : suggestedList.slice(1).concat(followUpList);

  return (
    <Animated.View
      style={[s.assistantRow, { opacity: fadeAnim }]}
      accessibilityLabel={`HELIOS: ${message.content}`}
    >
      {/* Orb avatar */}
      <View style={s.assistantOrbCol} pointerEvents="none">
        <HeliosEnergyCore size={ORBS_MSG_SIZE} interactive={false} />
      </View>

      <View style={s.assistantContentCol}>
        {/* Label: HELIOS + timestamp */}
        <View style={s.assistantMsgLabel}>
          <Text style={s.assistantLabelName}>HELIOS</Text>
          <Text style={s.assistantLabelTime}>{formatTime(message.timestamp)}</Text>
        </View>

        {/* Main bubble */}
        <View style={s.assistantBubble}>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Text style={s.assistantText}>{message.content}</Text>
            {message.streaming && <StreamingCursor colors={colors} />}
          </View>

          {topAction ? (
            <>
              <StatsRow action={topAction} colors={colors} />
              <ActionPanel
                action={topAction}
                expanded={isExpanded}
                onToggle={() => onToggleExpand(message.id)}
                onPress={() => onChipPress(topAction.title)}
                colors={colors}
              />
            </>
          ) : inBubblePill ? (
            <InBubbleActionPill label={inBubblePill} onPress={() => onChipPress(inBubblePill)} colors={colors} />
          ) : null}
        </View>

        {/* Context source chips — only when backend provides them */}
        {message.context_sources && message.context_sources.length > 0 && (
          <ContextSourceChips sources={message.context_sources} colors={colors} />
        )}

        {/* External chips row */}
        {externalChips.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 8 }}
            contentContainerStyle={{ gap: 7, paddingRight: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {externalChips.slice(0, 4).map((c) => (
              <TouchableOpacity
                key={c}
                style={s.chipBtn}
                onPress={() => onChipPress(c)}
                activeOpacity={0.7}
                accessibilityLabel={c}
                accessibilityRole="button"
              >
                <Text style={s.chipBtnText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ── Typing Bubble ─────────────────────────────────────────────────────────────

function TypingBubble({ statusLabel, colors }: { statusLabel?: string; colors: ThemeColors }) {
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={s.assistantRow} accessibilityLabel="HELIOS is thinking">
      <View style={s.assistantOrbCol} pointerEvents="none">
        <HeliosEnergyCore size={ORBS_MSG_SIZE} interactive={false} />
      </View>
      <View style={s.assistantContentCol}>
        <View style={s.assistantMsgLabel}>
          <Text style={s.assistantLabelName}>HELIOS</Text>
        </View>
        <View style={[s.assistantBubble, s.typingBubble]}>
          <AnimatedDots colors={colors} />
          <Text style={s.typingText}>{statusLabel ?? "Thinking"}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Message Composer ──────────────────────────────────────────────────────────

function MessageComposer({
  value,
  onChange,
  onSend,
  onVoice,
  onAttach,
  disabled,
  colors,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onVoice?: () => void;
  onAttach?: (type: AttachmentType) => void;
  disabled: boolean;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createStyles(colors), [colors]);
  const canSend = !disabled && value.trim().length > 0;

  return (
    <View style={s.composer}>
      <TextInput
        style={s.composerInput}
        value={value}
        onChangeText={onChange}
        placeholder="Ask HELIOS anything..."
        placeholderTextColor={colors.textMuted}
        autoCapitalize="sentences"
        autoCorrect
        spellCheck
        multiline
        maxLength={2000}
        returnKeyType="send"
        onSubmitEditing={onSend}
        blurOnSubmit={false}
        editable={!disabled}
        accessibilityLabel="Message input"
        accessibilityHint="Type your message to HELIOS"
      />
      <TouchableOpacity
        style={s.composerIconBtn}
        onPress={onVoice}
        activeOpacity={0.7}
        accessibilityLabel="Voice input"
        accessibilityRole="button"
      >
        <SymbolView name="mic" size={17} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
      </TouchableOpacity>
      <TouchableOpacity
        style={s.composerIconBtn}
        onPress={() => onAttach?.("file")}
        activeOpacity={0.7}
        accessibilityLabel="Attach file"
        accessibilityRole="button"
      >
        <SymbolView name="paperclip" size={17} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.sendBtn, !canSend && s.sendBtnDisabled]}
        onPress={onSend}
        disabled={!canSend}
        activeOpacity={0.85}
        accessibilityLabel="Send message"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend }}
      >
        <SymbolView name="arrow.up" size={17} tintColor="#ffffff" resizeMode="scaleAspectFit" />
      </TouchableOpacity>
    </View>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────

function HistoryModal({
  visible,
  conversations,
  currentConversationId,
  isLoadingHistory,
  onClose,
  onSelect,
  onNew,
}: {
  visible: boolean;
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  isLoadingHistory: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={s.historyCard}>
              <View style={s.historyHeader}>
                <Text style={s.historyTitle}>CONVERSATION HISTORY</Text>
                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Close history"
                  accessibilityRole="button"
                >
                  <SymbolView name="xmark" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={s.newConvButton}
                onPress={() => { onNew(); onClose(); }}
                activeOpacity={0.8}
                accessibilityLabel="Start new conversation"
                accessibilityRole="button"
              >
                <SymbolView name="plus" size={11} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
                <Text style={s.newConvButtonText}>NEW CONVERSATION</Text>
              </TouchableOpacity>

              {isLoadingHistory && (
                <View style={s.historyCenter}>
                  <AnimatedDots colors={colors} />
                </View>
              )}

              {!isLoadingHistory && conversations.length === 0 && (
                <View style={s.historyCenter}>
                  <Text style={s.historyEmptyText}>No conversations yet.</Text>
                </View>
              )}

              {!isLoadingHistory && conversations.length > 0 && (
                <ScrollView style={s.historyList} showsVerticalScrollIndicator={false}>
                  {conversations.map((conv) => {
                    const isCurrent = conv.id === currentConversationId;
                    return (
                      <TouchableOpacity
                        key={conv.id}
                        style={[s.historyRow, isCurrent && s.historyRowActive]}
                        onPress={() => { onSelect(conv.id); onClose(); }}
                        activeOpacity={0.7}
                        accessibilityLabel={conv.title}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isCurrent }}
                      >
                        <View style={s.historyRowBody}>
                          <Text style={[s.historyRowTitle, isCurrent && s.historyRowTitleActive]} numberOfLines={1}>
                            {conv.title}
                          </Text>
                          <Text style={s.historyRowMeta}>
                            {conv.message_count} {conv.message_count === 1 ? "message" : "messages"} · {formatDate(conv.updated_at)}
                          </Text>
                        </View>
                        {isCurrent && <View style={s.historyActiveDot} />}
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
  const insets = useSafeAreaInsets();
  const navClearance = insets.bottom + NAV_PILL_STATIC;
  const accessToken = useAuthStore((s) => s.accessToken);

  // ── Identity resolution for AI greeting ──────────────────────────────────────
  // assistant_name_preference controls which identity field HELIOS uses.
  // The home hero card always uses display_name; this chain is AI-conversation only.
  const assistantNamePref = useSettingsStore((s) => s.assistant_name_preference ?? "display_name");
  const preferredName     = useSettingsStore((s) => s.preferred_name);
  const profileDispName   = useProfileStore((s) => s.display_name);
  const profileFirstName  = useProfileStore((s) => s.first_name);
  const authUserName      = useAuthStore((s) => s.user?.name ?? null);

  const displayName = (() => {
    if (assistantNamePref === "preferred_name" && preferredName) return preferredName;
    if (assistantNamePref === "first_name" && profileFirstName) return profileFirstName;
    // Default: display_name, then fall through the full chain
    return profileDispName ?? preferredName ?? profileFirstName ?? authUserName ?? "there";
  })();

  const {
    currentConversationId,
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

  const [input, setInput]                   = useState("");
  const [contextMode]                       = useState(true);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [expandedMsgId, setExpandedMsgId]   = useState<string | null>(null);
  const listRef         = useRef<FlatList<ChatMessage>>(null);
  const isAtBottomRef   = useRef(true);

  const aiStatus = deriveAIStatus(isInitializing, isSending, !!initError);

  useEffect(() => {
    if (accessToken) initializeConversation(accessToken);
  }, [accessToken, initializeConversation]);

  // Smart auto-scroll: only pull to bottom when user is already near bottom
  // or when a new user message was just added (we always want to see our own sends).
  useEffect(() => {
    const lastMsg = currentMessages[currentMessages.length - 1];
    const userJustSent = lastMsg?.role === "user";
    if (isAtBottomRef.current || userJustSent || isSending) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [currentMessages, isSending]);

  useEffect(() => {
    if (historyVisible && accessToken) fetchConversations(accessToken);
  }, [accessToken, fetchConversations, historyVisible]);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isAtBottomRef.current = distFromBottom < 80;
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !accessToken || isSending || isInitializing) return;
      setInput("");
      isAtBottomRef.current = true; // always scroll after sending

      if (!currentConversationId) {
        await initializeConversation(accessToken);
        if (!useConversationStore.getState().currentConversationId) return;
      }

      await sendMessage(accessToken, { message: trimmed, include_context: contextMode });
    },
    [accessToken, isSending, isInitializing, currentConversationId, contextMode, initializeConversation, sendMessage],
  );

  const handleSend    = useCallback(() => sendText(input), [input, sendText]);
  const handleNewConv = useCallback(() => { if (accessToken) createNewConversation(accessToken); }, [accessToken, createNewConversation]);
  const handleSelect  = useCallback((id: string) => { if (accessToken) loadConversation(accessToken, id); }, [accessToken, loadConversation]);
  const handleRetry   = useCallback(() => { if (accessToken) initializeConversation(accessToken); }, [accessToken, initializeConversation]);
  const handleToggleExpand = useCallback(
    (id: string) => setExpandedMsgId((prev) => (prev === id ? null : id)),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) =>
      item.role === "user" ? (
        <UserBubble message={item} colors={colors} />
      ) : (
        <AssistantBubble
          message={item}
          expandedId={expandedMsgId}
          onToggleExpand={handleToggleExpand}
          onChipPress={sendText}
          colors={colors}
        />
      ),
    [colors, expandedMsgId, handleToggleExpand, sendText],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);
  const hasMessages  = currentMessages.length > 0;

  const ListHeader = useMemo(
    () =>
      !hasMessages ? (
        <View style={{ gap: 16, marginBottom: 8 }}>
          <WelcomeCard displayName={displayName} colors={colors} />
          <SuggestedPrompts onAction={sendText} colors={colors} />
        </View>
      ) : null,
    [hasMessages, displayName, colors, sendText],
  );

  const typingLabel =
    aiStatus === "thinking" ? "Thinking" :
    aiStatus === "connecting" ? "Connecting" : "Thinking";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? navClearance : 0}
    >
      <AssistantHeader
        aiStatus={aiStatus}
        onHistoryPress={() => setHistoryVisible(true)}
        onNewPress={handleNewConv}
        colors={colors}
      />

      {/* Initializing / error banners */}
      {isInitializing && (
        <View style={bannerWrapStyle(colors.accentCyan)}>
          <AnimatedDots colors={colors} />
          <Text style={bannerTextStyle(colors.accentCyan)}>CONNECTING…</Text>
        </View>
      )}
      {!isInitializing && initError && (
        <View style={bannerWrapStyle(colors.danger)}>
          <Text style={[bannerTextStyle(colors.danger), { flex: 1 }]} numberOfLines={2}>
            {friendlyError(initError)}
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            activeOpacity={0.8}
            accessibilityLabel="Retry connection"
            accessibilityRole="button"
          >
            <Text style={bannerTextStyle(colors.accentCyan)}>RETRY</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={currentMessages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={isSending ? <TypingBubble statusLabel={typingLabel} colors={colors} /> : null}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      />

      {/* Send error */}
      {sendError ? (
        <View style={sendErrStyle(colors)}>
          <Text style={{ color: colors.danger, fontSize: 12 }}>{friendlyError(sendError)}</Text>
        </View>
      ) : null}

      {/* Composer */}
      <View style={{ marginBottom: navClearance }}>
        <MessageComposer
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={isSending || isInitializing}
          colors={colors}
        />
      </View>

      <HistoryModal
        visible={historyVisible}
        conversations={conversations}
        currentConversationId={currentConversationId}
        isLoadingHistory={isLoadingHistory}
        onClose={() => setHistoryVisible(false)}
        onSelect={handleSelect}
        onNew={handleNewConv}
      />
    </KeyboardAvoidingView>
  );
}

// ── Inline style factories ────────────────────────────────────────────────────

function bannerWrapStyle(color: string): any {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: `${color}12`,
    borderBottomWidth: 1,
    borderBottomColor: `${color}33`,
  };
}

function bannerTextStyle(color: string): any {
  return { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.8, color };
}

function sendErrStyle(colors: ThemeColors): any {
  return {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: `${colors.danger}1a`,
    borderWidth: 1,
    borderColor: `${colors.danger}4d`,
    borderRadius: 10,
    padding: 10,
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 0,
      paddingRight: 16,
      paddingTop: 2,
      paddingBottom: 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: { flex: 1, gap: 2, marginLeft: -18 },
    headerHELIOS: { fontSize: 12, fontWeight: "800", color: colors.textPrimary, letterSpacing: 3 },
    headerSubRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    headerAssistant: { fontSize: 20, fontWeight: "900", color: colors.accent },
    onlineDot: { width: 7, height: 7, borderRadius: 4 },
    headerOnline: { fontSize: 12, fontWeight: "600" },
    headerOrbWrap: { alignItems: "center", justifyContent: "center", marginLeft: -10 },
    headerRight: { flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 },
    iconBtn: { alignItems: "center", gap: 4 },
    iconBtnCircle: {
      width: 42, height: 42, borderRadius: 21,
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center", justifyContent: "center",
    },
    iconBtnCircleActive: { borderColor: `${colors.accent}60`, backgroundColor: `${colors.accent}18` },
    iconBtnLabel: { fontSize: 10, fontWeight: "600", color: colors.textMuted },
    iconBtnLabelActive: { color: colors.accent },

    // Welcome Card
    welcomeCard: {
      backgroundColor: colors.surface,
      borderRadius: 18, borderWidth: 1, borderColor: colors.border,
      padding: 20, gap: 10, alignItems: "center",
    },
    welcomeOrbWrap: { marginBottom: 4 },
    welcomeGreeting: { fontSize: 19, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
    welcomeQuestion: { fontSize: 15, fontWeight: "500", color: colors.textSecondary, textAlign: "center" },

    // Suggested Prompts
    promptsSection: { gap: 10 },
    promptsLabel: { fontSize: 10, fontWeight: "800", color: colors.textMuted, letterSpacing: 1.5 },
    promptChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 14, paddingVertical: 9,
      borderRadius: 22,
      borderWidth: 1, borderColor: `${colors.accent}44`,
      backgroundColor: `${colors.accent}10`,
    },
    promptChipText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, flexShrink: 0 },

    // User Bubble
    userRow: { alignItems: "flex-end" },
    userBubble: {
      alignSelf: "flex-end", maxWidth: "78%",
      backgroundColor: colors.accent,
      borderRadius: 20, borderBottomRightRadius: 5,
      paddingHorizontal: 15, paddingVertical: 11,
    },
    userText: { fontSize: 15, fontWeight: "500", color: "#ffffff", lineHeight: 22 },
    msgTimestamp: { fontSize: 11, color: colors.textMuted, marginTop: 4, alignSelf: "flex-end" },

    // Assistant Bubble
    assistantRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
    assistantOrbCol: {
      width: ORBS_MSG_SIZE + 20,
      paddingTop: 22,
      alignItems: "center",
    },
    assistantContentCol: { flex: 1 },
    assistantMsgLabel: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
    assistantLabelName: { fontSize: 11, fontWeight: "800", color: colors.accent, letterSpacing: 1.5 },
    assistantLabelTime: { fontSize: 11, fontWeight: "500", color: colors.textMuted },
    assistantBubble: {
      backgroundColor: colors.surface,
      borderRadius: 18, borderTopLeftRadius: 4,
      borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 14, paddingVertical: 13,
      gap: 12,
    },
    assistantText: { fontSize: 15, fontWeight: "400", color: colors.textPrimary, lineHeight: 23 },

    // Stats Row
    statsRow: {
      flexDirection: "row",
      borderTopWidth: 1, borderTopColor: colors.border,
      paddingTop: 12, gap: 0,
    },
    statItem: { flex: 1, alignItems: "center", gap: 5 },
    statLabel: { fontSize: 9, fontWeight: "800", color: colors.textMuted, letterSpacing: 1 },
    statValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    statValue: { fontSize: 14, fontWeight: "800", color: colors.accentCyan },
    statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 2 },

    // Action Panel
    actionPanel: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 },
    actionPanelLabel: { fontSize: 9, fontWeight: "800", color: colors.textMuted, letterSpacing: 1 },
    actionPanelBody: { flexDirection: "row", alignItems: "center", gap: 10 },
    actionPanelTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    actionPanelBtn: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingVertical: 7, paddingHorizontal: 12,
      borderRadius: 20, borderWidth: 1,
      borderColor: `${colors.accent}66`,
      backgroundColor: `${colors.accent}18`,
    },
    actionPanelBtnText: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
    actionPanelDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
    whyRow: { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "center", paddingTop: 4 },
    whyText: { fontSize: 12, fontWeight: "500", color: colors.textMuted },

    // In-bubble action pill
    inBubblePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "flex-start",
      paddingVertical: 8,
      paddingRight: 14, paddingLeft: 4,
      borderRadius: 20, borderWidth: 1,
      borderColor: `${colors.accent}55`,
      backgroundColor: `${colors.accent}10`,
      marginTop: 4,
    },
    inBubblePillIcon: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: `${colors.accent}22`,
      alignItems: "center", justifyContent: "center",
    },
    inBubblePillText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },

    // External chips
    chipBtn: {
      paddingHorizontal: 13, paddingVertical: 7,
      borderRadius: 20, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipBtnText: { fontSize: 12.5, fontWeight: "600", color: colors.textSecondary },

    // Context source chips (backend-driven)
    ctxChipsRow: {
      flexDirection: "row", alignItems: "center",
      flexWrap: "wrap", gap: 6, marginTop: 6,
    },
    ctxChipsLabel: { fontSize: 9, fontWeight: "800", color: colors.textMuted, letterSpacing: 1 },
    ctxChip: {
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 10, borderWidth: 1,
      borderColor: `${colors.accentCyan}44`,
      backgroundColor: `${colors.accentCyan}10`,
    },
    ctxChipText: { fontSize: 10, fontWeight: "600", color: colors.accentCyan },

    // Typing
    typingBubble: {
      flexDirection: "row", alignItems: "center", gap: 10,
      alignSelf: "flex-start", paddingVertical: 12,
    },
    typingText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },

    // Composer
    composer: {
      flexDirection: "row", alignItems: "flex-end", gap: 8,
      paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
      backgroundColor: colors.background,
    },
    composerInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 26, borderWidth: 1, borderColor: `${colors.accent}40`,
      color: colors.textPrimary,
      fontSize: 15, fontWeight: "400",
      paddingHorizontal: 18, paddingVertical: 13,
      maxHeight: 120, minHeight: 52,
    },
    composerIconBtn: {
      width: 46, height: 46, borderRadius: 23,
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center", justifyContent: "center",
    },
    sendBtn: {
      width: 46, height: 46, borderRadius: 23,
      backgroundColor: colors.accent,
      alignItems: "center", justifyContent: "center",
    },
    sendBtnDisabled: { backgroundColor: `${colors.accent}50` },

    // History Modal
    modalOverlay: {
      flex: 1, backgroundColor: colors.overlay,
      justifyContent: "center", alignItems: "center",
      paddingHorizontal: spacing.lg,
    },
    historyCard: {
      width: "100%", maxHeight: "80%",
      backgroundColor: colors.glassStrong,
      borderRadius: radius.xl, borderWidth: 1, borderColor: colors.primaryBorder,
      overflow: "hidden",
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 16 },
      elevation: 18,
    },
    historyHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg, paddingBottom: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.secondaryBorder,
    },
    historyTitle: { fontSize: 11, fontWeight: "800", color: colors.accent, letterSpacing: 1.5 },
    newConvButton: {
      flexDirection: "row", alignItems: "center", gap: 6,
      margin: spacing.md, paddingVertical: spacing.sm,
      borderRadius: radius.sm, borderWidth: 1, borderColor: colors.accentCyan,
      justifyContent: "center",
    },
    newConvButtonText: { fontSize: 11, fontWeight: "700", color: colors.accentCyan, letterSpacing: 0.8 },
    historyList: { maxHeight: 360 },
    historyCenter: { padding: spacing.xl, alignItems: "center" },
    historyEmptyText: { fontSize: 14, color: colors.textMuted },
    historyRow: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    historyRowActive: { backgroundColor: `${colors.accent}14` },
    historyRowBody: { flex: 1, gap: 3 },
    historyRowTitle: { fontSize: 14, fontWeight: "500", color: colors.textPrimary },
    historyRowTitleActive: { color: colors.accent },
    historyRowMeta: { fontSize: 11, color: colors.textMuted },
    historyActiveDot: {
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: colors.accent,
      marginLeft: spacing.sm, flexShrink: 0,
    },

  });
}
