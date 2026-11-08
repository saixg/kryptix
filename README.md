# Kryptix — Multi-Turn LLM Platform with testing and  comparision (under dev)

> **Internship Assignment Submission**  
> **Project**: Context-Managed Multi-Turn Conversational AI Platform (**ROGUE**)  
> **Author**: Engineering Intern  
> **Repository**: [https://github.com/saixg/kryptix.git](https://github.com/saixg/kryptix.git)

---

## 📌 Executive Summary

This repository represents the completed technical assignment given to me as an **AI / Full-Stack Engineering Intern**. The task was to build a production-grade conversational AI platform backed by real LLM APIs (**Google Gemini** and **OpenAI**) featuring active **Context Window Management**, resilient error recovery, defined system persona architectures, multimodal file processing, and a ChatGPT-style interface.

All source code, tests, and configuration files for this assignment are organized in the [`LLM-api/`](./LLM-api/) directory.

---

## 🎯 Requirements & Verification Matrix

| Requirement | Implementation Details | Location | Status |
|---|---|---|---|
| **Real LLM Backend Endpoint** | REST endpoints (`POST /api/chat`, `GET /api/health`, `GET /api/conversations`) connecting to Google Gemini Interactions API (`gemini-3.5-flash-lite` / `gemini-3.8-flash`) and OpenAI (`gpt-4o-mini`). | [`LLM-api/src/server.js`](./LLM-api/src/server.js) | ✅ Verified |
| **Multi-Turn Memory** | Per-conversation state tracking user & assistant history across sequential turns. | [`LLM-api/src/context/contextManager.js`](./LLM-api/src/context/contextManager.js) | ✅ Verified |
| **Context Window Management** | **1. Progressive Rolling Summarization**: Condenses older history outside active window into running synopsis prepended to memory.<br>**2. Sliding Window Truncation**: Drops turns outside active window to stay strictly within limits. | [`LLM-api/src/context/contextManager.js`](./LLM-api/src/context/contextManager.js) | ✅ Verified |
| **System Prompt Personas** | Three distinct personas: **Aria** (Senior Systems Architect & Mentor), **Socrates** (Philosophical Guide), and **Byte** (Direct Minimalist). | [`LLM-api/src/prompts/systemPrompts.js`](./LLM-api/src/prompts/systemPrompts.js) | ✅ Verified |
| **Error Handling & Resilience** | Translates rate limits (429), auth failures (401/403), service overloads (503), and timeouts into clear actionable messages. | [`LLM-api/src/providers/geminiProvider.js`](./LLM-api/src/providers/geminiProvider.js) | ✅ Verified |
| **Security & Git Hygiene** | API keys managed via `.env` with `.env.example` template; `.gitignore` blocks all environment secrets from git commits. | [`LLM-api/.gitignore`](./LLM-api/.gitignore), [`LLM-api/.env.example`](./LLM-api/.env.example) | ✅ Verified |
| **ChatGPT-Style Web Interface** | Collapsible sidebar with chat history, centered floating dock, attachments, and real-time SVG circular context gauge. | [`LLM-api/public/`](./LLM-api/public/) | ✅ Verified |
| **3D Thinking Animation & Token Counter** | Pure CSS 3D rotating isometric hypercube with an animated live token ticker (`420 → 710 → 980 tokens`). | [`LLM-api/public/style.css`](./LLM-api/public/style.css), [`LLM-api/public/app.js`](./LLM-api/public/app.js) | ✅ Verified |
| **Interactive Terminal CLI** | Dedicated command-line interface with `/stats`, `/summary`, `/strategy`, `/persona`, `/reset`, and `/exit`. | [`LLM-api/src/cli.js`](./LLM-api/src/cli.js) | ✅ Verified |

---

## 🧠 Context Window Management Architecture

Standard LLMs suffer from context window overflow, rising costs, and increased latency as conversations expand. This platform implements a dual-strategy context manager:

```
                          [ Incoming User Query ]
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │ Total Messages > Limit (6)?   │
                     └───────────────┬───────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
               [ NO: Normal ]                 [ YES: Exceeded ]
                     │                               │
        Pass All History to Model                    ├───────────────────────────────┐
                                                     ▼                               ▼
                                            [ Sliding Window ]            [ Rolling Summarization ]
                                                     │                               │
                                            Keep Last N Turns             Older turns sent to LLM
                                            (Discard earlier)             Summarizer prompt
                                                     │                               │
                                                     │                    Prepend condensed memory:
                                                     │                    [Memory Summary] + [Active Turns]
                                                     │                               │
                                                     └───────────────┬───────────────┘
                                                                     │
                                                                     ▼
                                                     ┌───────────────────────────────┐
                                                     │  Google Gemini / OpenAI Call  │
                                                     └───────────────────────────────┘
```

### Visual Circular Gauge
The interface features an **SVG Circular Progress Ring** in the navigation header that reflects context saturation in real time:
- 🟢 **Cyan (<50%)**: Optimal context depth.
- 🟡 **Amber (50%–80%)**: Active window expanding.
- 🟣 **Purple (>80%)**: Rolling memory condensation actively running.

---

## 📂 Repository Structure

```
kryptix/
├── README.md                      # Internship project overview & documentation
├── .gitignore                     # Global gitignore preventing credential leaks
└── LLM-api/                       # Main application workspace
    ├── .env.example               # Template for API keys
    ├── .gitignore                 # Directory-level secret protection
    ├── package.json               # Scripts & dependencies
    ├── package-lock.json          # Dependency lockfile
    ├── public/                    # ChatGPT-style Web Interface
    │   ├── index.html             # Centered layout, sidebar, drawer, 3D loader
    │   ├── style.css              # Obsidian dark theme & 3D CSS animations
    │   └── app.js                 # Real-time state, attachments, context gauges
    ├── scripts/                   # Verification & test scripts
    │   ├── test-connection.js     # Health check & latency verification
    │   ├── test-models.js         # Model capability benchmark
    │   ├── probe-server.js        # REST API endpoint probe
    │   └── probe-attachments.js   # Multimodal attachment test
    ├── src/                       # Core backend architecture
    │   ├── server.js              # Express REST API & session manager
    │   ├── cli.js                 # Interactive terminal chat client
    │   ├── config.js              # Environment validator & settings
    │   ├── context/
    │   │   └── contextManager.js  # Multi-turn memory & summarization engine
    │   ├── prompts/
    │   │   └── systemPrompts.js   # Persona definitions (Aria, Socrates, Byte)
    │   └── providers/
    │       ├── geminiProvider.js  # Google GenAI Interactions API adapter
    │       ├── openaiProvider.js  # OpenAI SDK adapter
    │       ├── mockProvider.js    # Local test simulator
    │       └── index.js           # Provider factory
    └── test/                      # Automated test suite
        ├── contextManager.test.js # Unit tests for memory & compaction
        └── e2e.test.js            # End-to-end multi-turn simulation test
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: `v20.0.0` or higher (Tested on `v24.18.0`)
- **API Key**: [Google AI Studio](https://aistudio.google.com/) (Gemini) or [OpenAI](https://platform.openai.com/api-keys)

### 2. Installation
Navigate into the `LLM-api/` folder and install dependencies:
```bash
cd LLM-api
npm install
```

### 3. Environment Configuration
Create a `.env` file from the provided template:
```bash
cp .env.example .env
```
Open `.env` and insert your API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
DEFAULT_PROVIDER=gemini
GEMINI_MODEL=gemini-3.5-flash-lite
```

### 4. Verify API Connection
Run the diagnostic script:
```bash
npm run test-connection
```

### 5. Run Automated Tests
Execute the unit and end-to-end test suites:
```bash
# Unit tests: memory, truncation, summarization, reset
npm test

# End-to-end multi-turn simulation test
npm run test:e2e
```

### 6. Launch the Web Application
Start the ROGUE web platform:
```bash
npm start
```
Visit **`http://localhost:3000`** in your browser.

- **Previous Chats**: Access past chats from the left sidebar or click `+ New Chat`.
- **Upload Attachments**: Click the paperclip icon or drag & drop images/documents into the chat.
- **Inspect Context**: Click the circular progress pill in the top bar to inspect exact token counts, active turns, and rolling summaries.
- **Mentions**: Type `@` to select quick directives (`@aria`, `@socratic`, `@byte`, `@code`, `@summarize`).

### 7. Launch the Terminal CLI
```bash
npm run cli
```
Available CLI commands:
- `/stats` — View total turns vs active sliding window.
- `/summary` — View the condensed running memory synopsis.
- `/strategy` — Toggle between `summarize` and `sliding_window`.
- `/persona` — Switch between Aria, Socrates, and Byte.
- `/reset` — Clear conversation history.
- `/exit` — Exit.

---

## ⚖️ Technical Highlights & Engineering Decisions

1. **Google Gemini Interactions API**: Utilizes the modern `ai.interactions.create` surface of `@google/genai` (v2.32) on `gemini-3.5-flash-lite` for high throughput, sub-second responses, and automatic fallback resilience.
2. **Pluggable Architecture**: The system uses an Adapter pattern (`GeminiProvider`, `OpenAIProvider`, `MockProvider`) allowing seamless switching between providers without modifying business logic.
3. **Multimodal Ingestion**: Supports base64 image parsing alongside structured document/code injection, automatically formatting input blocks for the LLM.
4. **Security Guarantee**: Strict `.gitignore` rules prevent `.env` credentials and `node_modules` from ever touching version control.

---

## 👨‍💻 Intern Conclusion
This project demonstrates end-to-end full-stack AI engineering: from low-level token management, rolling context summarization, and official SDK interop, to responsive 3D web interfaces, error handling, and robust automated testing.
