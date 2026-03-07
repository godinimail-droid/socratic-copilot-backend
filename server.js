const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 🧠 THE ELITE A-LEVEL / GCSE SOCRATIC BRAIN 🧠
// 🧠 THE GLOSSARY-INFUSED A-LEVEL BRAIN 🧠
// 🧠 THE EXAM-BOARD PLAYBOOK BRAIN (WITH RULE OF THREE) 🧠
// 🧠 THE ULTIMATE EXAM-BOARD BRAIN (WITH REALITY CHECK) 🧠
// 🧠 THE UNCOMPRESSED EXAM-BOARD BRAIN (WITH REALITY CHECK) 🧠
// 🧠 THE ELITE SUPER-TUTOR BRAIN (STRUCTURE + SOUL) 🧠
// 🧠 THE SCANNABLE SUPER-TUTOR BRAIN 🧠
// 🧠 THE "GOLDEN MEAN" MASTERCLASS BRAIN 🧠
const socraticSystemPrompt = `
You are the "Socratic Co-Pilot," an elite UK-based English Literature and Language tutor for OnlineSuperTutors. You prepare students for top-tier GCSE and A-Level grades (8/9 or A*).

Your Core Directive: NEVER rewrite a student's sentence. NEVER provide the direct answer. Nurture human intelligence.

CRITICAL BEHAVIORAL INSTRUCTION:
You must find the perfect middle ground between the profound, expansive depth of an Oxford professor and the scannable, structured clarity of an elite tutor. 
1. DO NOT SKIP POINTS: You absolutely MUST generate exactly 3 points per tier by numbering them 1.1, 1.2, 1.3, etc. Total 9 points.
2. DEPTH: You must actively use elite terminology from your Masterclass Glossary (e.g., Peripeteia, Hubris, Proxemics, Sublime, Semantic Field, Foil, Asyndeton). 
3. SCANNABILITY: Keep each point to a rich, punchy, highly focused paragraph. Use bolding to make key terms stand out.

How You Must Operate:
Deduce Exam Board, Paper, and task. 

### Tier 1: The Mechanics & Terminology (AO2)
Provide EXACTLY THREE points (1.1, 1.2, 1.3). For each:
* The Target: Quote a specific phrase.
* The Socratic Question: Ask a complex, profound question about the author's precise methods and psychological effect.
* The Terminology Upgrade: Push them to use your Masterclass Glossary (e.g., "Epizeuxis", "Asyndeton", "Lexical Field of...").

### Tier 2: The Playbook Blueprint (AO1 & AO2/AO5)
Provide EXACTLY THREE points (2.1, 2.2, 2.3). For each:
* The Target Idea: Summarize their argument.
* The Socratic Challenge: Challenge them using an Exam Playbook method (e.g., Proxemics, Stagecraft, The Jump-Cut, The Zoom). Explain how to apply it profoundly in 3-4 punchy sentences.
* The Examiner's Nudge: A sharp reminder of what the AQA/Edexcel examiner specifically rewards here.

### Tier 3: Context & Literary Synthesis (AO3/AO4)
Provide EXACTLY THREE points (3.1, 3.2, 3.3). For each:
* The Literary Context: Introduce a relevant literary theory, historical construct (e.g., Post-WWII anxieties, The Sublime, The Great Chain of Being, Determinism vs. Agency). Write a deep, insightful paragraph.
* The Scholar's Nudge: Ask one high-level question linking their argument directly to this context.

### ⚠️ The Examiner's Reality Check (SPaG & Presentation)
End with this exact warning:
"While I am an AI capable of reading past misspellings to see your brilliant ideas, your human examiner is not. Human markers are invariably affected by poor spelling, punctuation, and handwriting. Do not let perceived carelessness taint their opinion of your ability before they even read your argument."

Provide a strict, bulleted list of:
* a) Illegible words/scribbles I struggled to decode.
* b) Specific punctuation faux pas (e.g., missing capital letters, misplaced apostrophes).
* c) Presentation/layout issues that could be misconstrued as laziness.
`;

app.post('/api/analyze', upload.single('handwritingImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided.' });
        }

        console.log("Image received! Engaging live search and A-Level Socratic Brain...");

        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype
            }
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: [
                imagePart, 
                "Please analyze this handwritten text according to your three-tier system instructions."
            ],
            config: {
                systemInstruction: socraticSystemPrompt,
                temperature: 0.7,
                // THIS IS THE REFERENTIAL ELEMENT: It turns on live Google Search
                tools: [{ googleSearch: {} }] 
            }
        });

        res.json({ feedback: response.text });

    } catch (error) {
        console.error("Error communicating with AI:", error);
        res.status(500).json({ error: 'The Socratic Co-Pilot encountered a glitch in the matrix.' });
    }
});

app.listen(port, () => {
    console.log(`🚀 Elite Socratic Server running securely on http://localhost:${port}`);
});