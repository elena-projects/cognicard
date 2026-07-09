# 📚 CogniCard

> Turn dense reading into a mind map you actually get.

![CogniCard](https://elenaprojects.cc/og-cognicard.png)

**Live:** https://cognicard.elenaprojects.cc · **About:** https://elenaprojects.cc/cognicard

Paste — or snap a photo of — a hard text, and CogniCard distills it into concept cards and a zoomable, NotebookLM-style **mind map** that shows how the ideas connect, plus a short analysis of what to learn first. When you can't focus on the page, an **ADHD-friendly focus reader** reads it aloud in a neural voice, highlighting each word — then spaced-repetition review and a self-test quiz help it stick.

## What's inside
- 🕸️ Zoomable **concept mind map** — pan / zoom, expand branches, export as PNG, with a learning analysis
- 🎧 **ADHD focus reader** — neural read-aloud with word highlighting, focus mode, bionic text, comfort tints
- 🔁 **Spaced-repetition** review deck · ✅ auto-generated **self-test quiz**
- 💬 Q&A assistant grounded in your text · 📄 PDF / image / .docx input
- 🌏 中文 / English · responsive on phone & desktop

## Tech
React 19 · Vite · Tailwind 4 · Google **Gemini** (concept extraction, mind map, neural TTS) · pdf.js & mammoth (file parsing). Deployed on **Google Cloud Run** (nginx) with a same-origin proxy for restricted networks.

## Run locally
```bash
npm install
echo 'GEMINI_API_KEY="your-gemini-key"' > .env.local
npm run dev
```

---
Built by **Elena**, a high-school student in Shanghai — part of a learning-science & psychology portfolio. More at [elenaprojects.cc](https://elenaprojects.cc).
