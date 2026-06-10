# Casual Conversation Feature

## Overview

Limon now recognizes casual, social, and emotional messages as a distinct
category and responds to them naturally — without triggering the off-topic
guard.

---

## Problem it Solves

The original classifier was binary (YES / NO for OS-related). Messages like
"Thanks!", "Good morning!", or "I'm tired" returned NO and triggered the
jarring "📌 Just so you know, that's not part of this course" message.

---

## Message Classifier (app.py)

`classify_message()` replaces `is_on_topic()` and returns one of three values:

| Return value | Meaning | Action |
|---|---|---|
| `"on_topic"` | OS-related question | Route to `aria_respond()` |
| `"casual"` | Social / emotional message | Route to `aria_respond()` |
| `"off_topic"` | Truly unrelated (math, creative writing, etc.) | Show off-topic redirect |

The LLM prompt categories:
- **ON_TOPIC** — processes, threads, scheduling, memory management, file systems, I/O, synchronization, virtualization, OS security
- **CASUAL** — greetings, thanks, affirmations, mood expressions, small talk, lesson transitions
- **OFF_TOPIC** — general coding, math, history, creative writing, personal advice

---

## Instructor Behavior (instructor.md)

**Rule 2 (OFF-TOPIC GUARD):** "small talk" removed from the trigger list.

**Rule 2.5 (CASUAL CONVERSATION)** added between Rule 2 and Mode A:

Casual response guidelines:
- Keep replies brief (1–3 sentences)
- Match the user's energy
- End with a soft, optional invitation to return to the lesson
- Never quiz or lecture during casual exchanges

### Examples

| User says | Limon responds |
|---|---|
| "Good morning!" | "Good morning! Ready to dive into some OS concepts? 😊" |
| "Thanks, that helped!" | "Glad it clicked! 😊 Want to keep going?" |
| "Got it" / "Makes sense" | "Great! Ready for the next step?" |
| "I'm tired" | "Take a break — we'll pick up right where we left off. 💪" |
| "How are you?" | "Doing great and ready to teach! What shall we tackle today?" |
| "Let's continue" | Resumes lesson naturally |

---

## Files Changed

| File | Change |
|---|---|
| `app.py` | `is_on_topic() → classify_message()`, 3-way dispatch in chat block |
| `.claude/instructor.md` | Removed "small talk" from Rule 2; added Rule 2.5 |
| `.claude/specs/Casual-conversation.md` | This file |

---

## Edge Cases

- **Ambiguous messages** (e.g., "okay") — default fallback is `"on_topic"`, so they pass through harmlessly.
- **Classifier error** — `except` block returns `"on_topic"` to avoid false positives on the off-topic guard.
- **Casual during pending off-topic** — the chat input is disabled while `pending_off_topic` is set, so casual messages cannot interrupt the Yes/No flow.
