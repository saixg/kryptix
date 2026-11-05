# Context-Managed Multi-Turn LLM Chatbot 🤖

A production-ready chatbot backend and dual-interface application (Modern Web UI + Interactive CLI) backed by real LLM APIs (**Google Gemini** and **OpenAI**) with active **Context Window Management**.

---

## 🎯 Key Features & Requirements Met

- ✅ **Unified Multi-Provider Support**: Built with the latest official `@google/genai` (Gemini 3.8 Flash, Gemini 3.5 Flash-Lite) and official `openai` (GPT-4o, GPT-4o-mini) SDKs.
- ✅ **Multi-Turn Conversation Memory**: Stores user and assistant dialog turns per session so the model references earlier facts, preferences, and code naturally.
- ✅ **Advanced Context Window Management**:
  - **Strategy A: Rolling Progressive Summarization** (Default): When dialog exceeds the active window (e.g. 6 messages), earlier turns are condensed by the LLM into a concise running synopsis and prepended to memory.
  - **Strategy B: Sliding Window Truncation**: Drops older messages outside the threshold to stay within strict token constraints.
- ✅ **Distinct Persona & System Prompting**: Ships with **Aria** (Senior Systems Architect & Mentor), **Socrates** (First-principles guide), and **Byte** (Minimalist direct responder) with no generic chatbot boilerplate.
- ✅ **Robust Error Handling**: Gracefully handles network timeouts, 429 rate limits, 401/403 invalid API keys, and model service overload with helpful user-facing recovery guidance.
- ✅ **Zero Secret Leaks**: Configured via `.env` with `.gitignore` and `.env.example` pre-configured.
- ✅ **Dual Interfaces**:
  1. **Modern Web UI** with an interactive **Context Window Inspector** drawer showing live token metrics, active turns, and rolling summaries.
  2. **Interactive CLI** with terminal commands (`/summary`, `/stats`, `/strategy`, `/persona`, `/reset`, `/exit`).

---

## 🏗️ Architecture

```
LLM-Api/
├── .env.example            # Environment template (Gemini / OpenAI keys)
├── .gitignore              # Ignores .env and node_modules
├── package.json            # Scripts & dependencies
├── README.md               # Complete documentation
├── scripts/
│   └── test-connection.js  # Step 2 API connectivity health-check
├── src/
│   ├── config.js           # Environment parser & validation
│   ├── server.js           # Express REST API & static server
│   ├── cli.js              # Interactive terminal chat interface
│   ├── context/
│   │   └── contextManager.js # Multi-turn memory & summarization engine
│   ├── prompts/
│   │   └── systemPrompts.js  # Defined persona system prompts
│   └── providers/
│       ├── geminiProvider.js # Google GenAI SDK integration
│       ├── openaiProvider.js # OpenAI SDK integration
│       └── index.js          # Provider factory
├── public/                 # Modern Web UI
│   ├── index.html          # Chat interface & Context Inspector
│   ├── style.css           # Dark theme design system
│   └── app.js              # Real-time state & API integration
└── test/
    └── contextManager.test.js # Comprehensive unit tests
```

---

## 🚀 Quickstart Guide

### 1. Get an API Key & Configure `.env`

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and add your API key:
- **Google Gemini** (Recommended, generous free tier): Obtain a key from [Google AI Studio](https://aistudio.google.com/).
  ```env
  GEMINI_API_KEY=your_gemini_api_key_here
  DEFAULT_PROVIDER=gemini
  GEMINI_MODEL=gemini-3.8-flash
  ```
- **OpenAI**: Obtain a key from [OpenAI Platform](https://platform.openai.com/api-keys).
  ```env
  OPENAI_API_KEY=your_openai_api_key_here
  DEFAULT_PROVIDER=openai
  OPENAI_MODEL=gpt-4o-mini
  ```

---

### 2. Verify Your API Connection (Step 2)

Run the automated diagnostic check:

```bash
npm run test-connection
```

This sends a minimal health-check ping to verify your key, reports latency, and logs token usage.

---

### 3. Run Context Management Unit Tests

Verify sliding window truncation, multi-turn memory assembly, and rolling summarization:

```bash
npm test
```

---

### 4. Launch the Web Application

Start the Express backend and web interface:

```bash
npm start
```

Visit **`http://localhost:3000`** in your browser.

- **Send messages** and watch multi-turn context persist across turns.
- Click **"🔍 Inspect Context"** in the top navigation bar to open the **Context Window Inspector**. You can watch the active window and rolling memory synopsis update live as the conversation grows!
- Switch between **Aria**, **Socrates**, or **Byte** personas on the fly.
- Toggle between **Rolling Summary** and **Sliding Window** compaction strategies.

---

### 5. Launch the Interactive CLI

Prefer chatting in the terminal? Run:

```bash
npm run cli
```

**CLI Commands**:
- `/summary` — View the condensed running summary of older turns.
- `/stats` — View total messages, active messages, and memory metrics.
- `/strategy` — Toggle between `summarize` and `sliding_window`.
- `/persona` — Switch bot persona (`aria`, `socratic`, `concise`).
- `/reset` — Clear conversation memory and start fresh.
- `/exit` — Exit the CLI.

---

## 🧠 Context Window Management Explained

### Why is this necessary?
LLMs have finite context windows, and repeatedly sending hundreds of historical messages increases latency, token costs, and eventually causes hard context overflow errors.

### Strategy 1: Sliding Window (`sliding_window`)
- Keeps the last $N$ messages (e.g. 6 messages = 3 turns).
- Earlier messages are silently truncated.
- **Best for**: Simple, short-memory tasks where only the immediate reply matters.

### Strategy 2: Rolling Summarization (`summarize`)
- Keeps the last $N$ messages in the active window.
- When message history exceeds $N$, older messages are sent to an LLM summarization prompt that builds a running memory synopsis.
- The synopsis is prepended to the active turns:
  ```
  [System Instruction] 
         ↓
  [Preceding Conversation Summary (Memory)]
         ↓
  [Recent Active Turns (Sliding Window)]
         ↓
  [New User Query]
  ```
- **Result**: The chatbot retains context from 20+ turns ago (e.g. user's name, project goals, tech stack) while keeping prompt tokens low and predictable.

---

## 🛡️ Error Handling Details

The system intercepts and translates common LLM API failure modes into clear, actionable messages:

| HTTP / Error Code | Description | User Message |
|---|---|---|
| `401 / 403` | Invalid API Key | Direct link to Google AI Studio or OpenAI to get/verify keys. |
| `429` | Rate Limit / Quota Exceeded | Recommends waiting briefly and checking quota usage. |
| `503 / 500` | Model Overloaded / Unavailable | Suggests retrying in a few seconds. |
| `Timeout / Abort` | Network Connection Issue | Advises checking internet connection without crashing the app. |
