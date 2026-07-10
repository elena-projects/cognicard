import { GoogleGenAI, Type } from "@google/genai";

const CONCEPTS_SYSTEM_INSTRUCTION = `You are an ELITE academic research assistant for 'CogniCard Academic'.
Task: Extract the high-level, technical concepts or professional terms that are genuinely central to the provided text.

Constraints:
1. COUNT: Scale the number of concepts to the text's length and conceptual density (see the target range given below). A short/simple text should yield only a few; a long/dense one, more. NEVER pad with trivial, generic, or redundant terms just to hit a number — quality over quantity.
2. FOCUS: Ignore common words. Only extract terms critical to the author's specific argument or methodology.
3. DEFINITION: Provide a context-strict definition (Max 15 words). Explain ONLY how it is used here.
4. LANGUAGE: Keep the term in its original language (e.g., Chinese if the text is Chinese).
5. FORMAT: Output ONLY valid JSON. No markdown blocks.`;

// Pick how many concept cards to ask for, based on how much text there is.
function conceptRange(text: string, hasImage: boolean): { min: number; max: number; target: number } {
  const len = text.trim().length;
  if (len === 0 && hasImage) return { min: 4, max: 8, target: 6 }; // image-only: unknown length
  if (len < 300) return { min: 3, max: 4, target: 3 };
  if (len < 800) return { min: 4, max: 6, target: 5 };
  if (len < 1800) return { min: 6, max: 8, target: 7 };
  if (len < 3500) return { min: 8, max: 10, target: 9 };
  return { min: 10, max: 14, target: 12 };
}

const OVERVIEW_SYSTEM_INSTRUCTION = `You are an expert academic synthesizer. Synthesize the provided long academic text into a structural overview.

CRITICAL RULES:
1. TRANSLATE TO PLAIN ENGLISH: Do NOT just copy-paste dense academic jargon (e.g., "heterogeneous expectations", "nonlinear steady-state"). You MUST translate the core meaning into highly accessible, smart-but-simple language. Explain it as if to a smart undergraduate student.
2. CORE THESIS: Exactly ONE concise sentence summarizing the main purpose (Max 25 words).
3. METHODOLOGY: Under 15 words describing the approach simply.
4. TAKEAWAYS: Exactly 3 high-impact conclusions. Each takeaway MUST be under 20 words and easy to read.
5. FORMAT: Output strictly in valid JSON format.`;

const DEEP_DIVE_SYSTEM_INSTRUCTION = `You are an expert academic tutor. Provide a lightning-fast deep dive into a specific concept.

Rules:
1. STRICT CONTEXT: Do not use generic definitions. Define it ONLY as it relates to the provided Original Text.
2. STRUCTURE: Follow the 3-part 'Golden Triangle' logic.
3. BREVITY: Max ONE sentence per section.
4. FORMAT: Output ONLY valid JSON.`;

export interface Concept {
  term: string;
  definition: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}
export interface QuizResponse {
  questions: QuizQuestion[];
}

// Build a self-test quiz (multiple choice) from the source text / extracted concepts.
export async function generateQuiz(
  text: string,
  concepts: Concept[],
  language: 'English' | 'Chinese' = 'English',
  count = 5,
): Promise<QuizResponse> {
  const genAI = getAI();
  const context = `SOURCE TEXT:\n${text.slice(0, 6000)}\n\nKEY CONCEPTS:\n${concepts.map((c) => `- ${c.term}: ${c.definition}`).join('\n')}`;
  const response = await genAI.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: context }] }],
    config: {
      systemInstruction: `You are an academic tutor building an active-recall quiz to help a student check their understanding of the material.
Rules:
1. Write exactly ${count} multiple-choice questions that test real comprehension of THIS material (concepts, relationships, implications) — not trivia or wording.
2. Each question has EXACTLY 4 options. Exactly one is correct. Distractors must be plausible but clearly wrong on close reading.
3. "answerIndex" is the 0-based index of the correct option.
4. "explanation" briefly (max 25 words) says why the answer is right, grounded in the material.
5. Vary difficulty; avoid giving away answers through phrasing or option length.
6. Output ONLY valid JSON. Write every field entirely in ${language}.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            minItems: count,
            maxItems: count,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 4, maxItems: 4 },
                answerIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
              },
              required: ['question', 'options', 'answerIndex', 'explanation'],
            },
          },
        },
        required: ['questions'],
      },
    },
  });
  if (!response.text) throw new Error('No response from AI');
  return JSON.parse(response.text) as QuizResponse;
}

export interface AnalysisResponse {
  concepts: Concept[];
}

// ---- Concept map (mind-map of how the concepts connect + a learning analysis) ----
export interface ConceptLink { from: string; to: string; relation: string; }
export interface ConceptGroup { label: string; terms: string[]; }
export interface LearningStep { term: string; why: string; }
export interface ConceptDetail { term: string; points: string[]; }
export interface ConceptMapData {
  central: string;
  links: ConceptLink[];
  groups: ConceptGroup[];
  details: ConceptDetail[];
  learning: { hubs: string[]; insight: string; path: LearningStep[]; };
}

// Given the already-extracted concepts, ask the model how they interconnect and how best
// to learn them. Returns links between concepts, thematic clusters, and a study analysis.
export async function analyzeConceptMap(
  concepts: Concept[],
  text: string,
  language: 'English' | 'Chinese' = 'English',
): Promise<ConceptMapData> {
  const genAI = getAI();
  const context = `SOURCE TEXT (excerpt):\n${text.slice(0, 6000)}\n\nEXTRACTED CONCEPTS:\n${concepts.map((c) => `- ${c.term}: ${c.definition}`).join('\n')}`;
  const response = await genAI.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: context }] }],
    config: {
      systemInstruction: `You are an expert learning-science tutor building a CONCEPT MAP (mind map) that reveals how the key concepts of this material connect, so a student can truly understand and learn it.

Use ONLY the concepts listed (reference them by their EXACT terms). Produce:
1. "central": a 2–5 word name for the central theme that ties all the concepts together.
2. "links": the meaningful relationships BETWEEN concepts. Each = {from, to, relation}. "from"/"to" MUST be exact terms from the list. "relation" is a SHORT phrase (max 5 words) naming how they connect (e.g. "causes", "is a type of", "measured by", "contrasts with", "builds on", "enables"). Only real, informative relationships — not every pair. Aim for roughly as many links as there are concepts, and make sure the map is connected (no isolated concept).
3. "groups": cluster the concepts into 2–4 themed sub-groups. Each = {label (2–4 words), terms:[exact terms]}. Every concept appears in EXACTLY one group.
4. "details": for EACH concept, 2–3 ULTRA-SHORT sub-points (max 6 words each) capturing its key aspects. Each = {term (exact), points:[...]}. These become the concept's child branches in the mind map — make them concrete and distinct, not a restatement of the definition.
5. "learning": help the student actually learn it —
   - "hubs": the 1–3 most foundational concepts to master FIRST (exact terms).
   - "insight": 1–2 sentences on how the ideas fit together and what depends on what.
   - "path": an ordered study sequence covering ALL concepts, most foundational first. Each step = {term (exact), why: ONE short sentence on why to learn it at this point and how it builds on the previous ones}.

Write every human-readable field (central, relation, label, insight, why) entirely in ${language}. Keep the concept terms themselves in their ORIGINAL language. Output ONLY valid JSON.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          central: { type: Type.STRING },
          links: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                from: { type: Type.STRING },
                to: { type: Type.STRING },
                relation: { type: Type.STRING },
              },
              required: ['from', 'to', 'relation'],
            },
          },
          groups: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                terms: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['label', 'terms'],
            },
          },
          details: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                points: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['term', 'points'],
            },
          },
          learning: {
            type: Type.OBJECT,
            properties: {
              hubs: { type: Type.ARRAY, items: { type: Type.STRING } },
              insight: { type: Type.STRING },
              path: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    why: { type: Type.STRING },
                  },
                  required: ['term', 'why'],
                },
              },
            },
            required: ['hubs', 'insight', 'path'],
          },
        },
        required: ['central', 'links', 'groups', 'details', 'learning'],
      },
    },
  });
  if (!response.text) throw new Error('No response from AI for concept map');
  return JSON.parse(response.text) as ConceptMapData;
}

export interface DocumentOverview {
  core_thesis: string;
  methodology: string;
  key_takeaways: string[];
}

export interface OverviewResponse {
  overview: DocumentOverview;
}

export interface ImagePart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export interface DeepDiveBreakdown {
  keyword: string;
  explanation: string;
}

export interface DeepDiveData {
  breakdown: DeepDiveBreakdown[];
  context_quote: string;
  analogy: string;
}

export interface DeepDiveResponse {
  deep_dive: DeepDiveData;
}

let ai: GoogleGenAI | null = null;

function getAI() {
  if (!ai) {
    // In production the bundle carries NO real key — nginx injects it server-side
    // (x-goog-api-key) at the /v1beta proxy. The placeholder just lets the SDK construct.
    // In dev, the real key from .env.local flows through so the vite proxy works.
    const apiKey = process.env.GEMINI_API_KEY || 'proxied';
    // Route all Gemini calls through our own origin (a same-origin /v1beta/ proxy),
    // so the browser never talks to googleapis.com directly. This keeps the app working
    // on networks where googleapis.com is blocked/unreachable (e.g. mainland China);
    // the server (nginx in prod, vite proxy in dev) forwards to Google.
    const httpOptions = typeof window !== 'undefined' ? { baseUrl: window.location.origin } : undefined;
    ai = new GoogleGenAI({ apiKey, httpOptions });
  }
  return ai;
}

// --- Neural Text-to-Speech (Gemini) -------------------------------------
// Converts the raw 16-bit PCM that the TTS model returns into a playable WAV blob.
function pcmBase64ToWav(base64: string, sampleRate = 24000): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = bytes.length;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(bytes);
  return new Blob([buffer], { type: 'audio/wav' });
}

// Returns an object URL for a WAV clip of `text` spoken by a Gemini prebuilt voice.
// Caller is responsible for URL.revokeObjectURL when done.
export async function synthesizeSpeech(text: string, voiceName = 'Kore'): Promise<string> {
  const genAI = getAI();
  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    } as any,
  });

  const part = response.candidates?.[0]?.content?.parts?.[0] as any;
  const data: string | undefined = part?.inlineData?.data;
  if (!data) throw new Error('No audio returned from TTS');

  // mimeType looks like "audio/L16;rate=24000" — pull the real sample rate if present.
  const mime: string = part?.inlineData?.mimeType || '';
  const rateMatch = mime.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

  return URL.createObjectURL(pcmBase64ToWav(data, sampleRate));
}

export async function analyzeText(text: string, language: 'English' | 'Chinese' = 'English', image?: ImagePart): Promise<AnalysisResponse> {
  const genAI = getAI();
  
  const contentParts: any[] = [];
  if (text.trim()) contentParts.push({ text: text.trim() });
  if (image) contentParts.push(image);

  if (contentParts.length === 0) throw new Error("No input provided");

  const { min, max, target } = conceptRange(text, !!image);

  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: contentParts }],
    config: {
      systemInstruction: `${CONCEPTS_SYSTEM_INSTRUCTION}\n\nTARGET COUNT: Extract about ${target} concepts for this text — no fewer than ${min}, no more than ${max}. Choose the number that honestly fits the content; do not stretch to reach ${max}.\n\nCRITICAL: Please output your response entirely in ${language}.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          concepts: {
            type: Type.ARRAY,
            minItems: min,
            maxItems: max,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING },
              },
              required: ["term", "definition"],
            },
          },
        },
        required: ["concepts"],
      },
    },
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  try {
    return JSON.parse(response.text) as AnalysisResponse;
  } catch (e) {
    console.error("Failed to parse AI response:", response.text);
    throw new Error("Invalid response format from AI");
  }
}

export async function analyzeOverview(text: string, language: 'English' | 'Chinese' = 'English', image?: ImagePart): Promise<OverviewResponse> {
  const genAI = getAI();
  
  const contentParts: any[] = [];
  if (text.trim()) contentParts.push({ text: text.trim() });
  if (image) contentParts.push(image);

  if (contentParts.length === 0) throw new Error("No input provided");

  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: contentParts }],
    config: {
      systemInstruction: `${OVERVIEW_SYSTEM_INSTRUCTION}\n\nCRITICAL: Please output your response entirely in ${language}.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overview: {
            type: Type.OBJECT,
            properties: {
              core_thesis: { type: Type.STRING },
              methodology: { type: Type.STRING },
              key_takeaways: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
            },
            required: ["core_thesis", "methodology", "key_takeaways"],
          },
        },
        required: ["overview"],
      },
    },
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  try {
    return JSON.parse(response.text) as OverviewResponse;
  } catch (e) {
    console.error("Failed to parse AI response:", response.text);
    throw new Error("Invalid response format from AI");
  }
}

export async function analyzeConceptDeepDive(term: string, context: string, language: 'English' | 'Chinese' = 'English'): Promise<DeepDiveResponse> {
  const genAI = getAI();
  
  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      { role: "user", parts: [{ text: `Term: ${term}\n\nContext:\n${context}` }] }
    ],
    config: {
      systemInstruction: `${DEEP_DIVE_SYSTEM_INSTRUCTION}\n\nCRITICAL: Please output your response entirely in ${language}.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          deep_dive: {
            type: Type.OBJECT,
            properties: {
              breakdown: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    keyword: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: ["keyword", "explanation"],
                },
              },
              context_quote: { type: Type.STRING },
              analogy: { type: Type.STRING },
            },
            required: ["breakdown", "context_quote", "analogy"],
          },
        },
        required: ["deep_dive"],
      },
    },
  });

  if (!response.text) {
    throw new Error("No response from AI for deep dive");
  }

  try {
    return JSON.parse(response.text) as DeepDiveResponse;
  } catch (e) {
    console.error("Failed to parse Deep Dive AI response:", response.text);
    throw new Error("Invalid Deep Dive response format from AI");
  }
}

export async function askDocumentQuestion(
  documentText: string,
  selectedImage: ImagePart | null,
  extractedConcepts: Concept[],
  extractedOverview: DocumentOverview | null,
  chatHistory: { role: 'user' | 'assistant', content: string }[],
  userQuestion: string,
  language: 'English' | 'Chinese'
): Promise<string> {
  const genAI = getAI();
  
  const systemInstruction = `You are "CogniCard Academic," an expert academic assistant engaging in a conversational dialogue. Your goal is to help users analyze documents (PDFs, Images, or Text) with extreme precision. The context provided comprises the document text, any uploaded image, and any previously extracted concepts or document overviews. Combine all this information intelligently to answer the user's questions.

CRITICAL INSTRUCTIONS FOR IMAGE/DOCUMENT ANALYSIS & LONG-FORM CONTEXT:
1. Visual Grounding & Mapping: When a user refers to an item by its position or index (e.g., "term 7," "the 5th point," "the bottom card"), you must scan the visual layout and map the request to the corresponding content. Do not say "not mentioned" just because the specific index number isn't explicitly written next to the text.
2. Semantic & Fuzzy Matching: If a user asks about "skills gap" and the document discusses "mismatch between educational outcomes and industry needs," you MUST connect these concepts based on the context.
3. Inference Over Refusal: Never give a hard refusal like "The document does not mention this" unless the topic is completely unrelated. If you cannot find an exact match, use the "Proactive Search" strategy: Say "I couldn't find the exact phrase [Term], but based on the [7th section/relevant area], the document discusses [Related Content]. Is this what you are referring to?"
4. Multi-Modal Synthesis: Treat the image as a structured data source. Analyze titles, lists, and spatial relationships between items. Base your answer on all collected data.
5. Length & Detail: Your answer MUST be extremely concise, strictly under 50 words, unless the user explicitly requests a longer or more detailed response. Distill the absolute essence of the content.
6. Tone & Format: Adopt the persona of a domain expert having a natural conversation with the user. Do not sound like an AI robotic assistant. Explain the core essence clearly using the Feynman technique.
7. NO MARKDOWN: You MUST NOT use any markdown formatting symbols like '#' or '*' in your response. Write in plain conversational text paragraphs only.
8. Language: Output your entire response in the language specified: ${language}.`;

  const contents: any[] = [];
  let initialContextAdded = false;

  for (let i = 0; i < chatHistory.length; i++) {
    const msg = chatHistory[i];
    const parts: any[] = [];
    
    if (msg.role === 'user' && !initialContextAdded) {
       let ctx = `[SYSTEM CONTEXT INJECTED START]\nText Input: ${documentText || "None"}\n`;
       if (extractedConcepts && extractedConcepts.length > 0) {
           ctx += `Summarized Concepts:\n${JSON.stringify(extractedConcepts)}\n`;
       }
       if (extractedOverview) {
           ctx += `Summarized Overview:\n${JSON.stringify(extractedOverview)}\n`;
       }
       ctx += `[SYSTEM CONTEXT INJECTED END]\n\n`;
       
       parts.push({ text: ctx });
       if (selectedImage) {
           parts.push(selectedImage);
       }
       initialContextAdded = true;
    }
    
    parts.push({ text: msg.content });
    contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts });
  }

  const currentUserParts: any[] = [];
  if (!initialContextAdded) {
       let ctx = `[SYSTEM CONTEXT INJECTED START]\nText Input: ${documentText || "None"}\n`;
       if (extractedConcepts && extractedConcepts.length > 0) {
           ctx += `Summarized Concepts:\n${JSON.stringify(extractedConcepts)}\n`;
       }
       if (extractedOverview) {
           ctx += `Summarized Overview:\n${JSON.stringify(extractedOverview)}\n`;
       }
       ctx += `[SYSTEM CONTEXT INJECTED END]\n\n`;
       
       currentUserParts.push({ text: ctx });
       if (selectedImage) {
           currentUserParts.push(selectedImage);
       }
  }
  currentUserParts.push({ text: userQuestion });
  contents.push({ role: 'user', parts: currentUserParts });

  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: contents,
    config: {
      systemInstruction: systemInstruction,
    }
  });

  return response.text || "No response generated.";
}
