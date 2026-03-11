require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');

// =====================================================================
// SERVER INITIALIZATION
// =====================================================================
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); 

const upload = multer({ storage: multer.memoryStorage() });

// =====================================================================
// AI & API AUTHENTICATION
// =====================================================================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const privateKey = process.env.GOOGLE_PRIVATE_KEY 
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : '';

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
});

const calendar = google.calendar({ version: 'v3', auth });
const MY_CALENDAR_ID = 'info@onlinesupertutors.org'; 

// =====================================================================
// ENDPOINT 1: THE CV BUILDER
// =====================================================================
app.post('/api/build-cv', upload.single('image'), async (req, res) => {
    try {
        const mode = req.body.mode;
        let userInput = req.body.text || '';
        let imagePart = null;

        if (mode === 'photo' && req.file) {
            imagePart = {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: req.file.mimetype
                }
            };
        }

        const systemInstruction = `
        You are an expert executive Career Coach. Transform the user's raw career history into a highly professional, ATS-friendly CV.
        Output MUST be formatted in standard Markdown.
        
        Structure the CV exactly like this:
        ## Professional Summary
        [Write a compelling 3-4 sentence executive summary]
        
        ## Key Transferable Skills
        [List 6-8 bullet points of high-level skills]
        
        ## Professional Experience
        [Format each role with the Job Title, Company/Context, and Dates]
        * [Action-driven bullet point 1]
        * [Action-driven bullet point 2]
        * [Action-driven bullet point 3]

        Finally, add a section at the very bottom titled:
        ## 💡 Career Coach Note
        [Write a short, warm, encouraging paragraph telling the user why their specific background is valuable and giving them confidence].
        `;

        let contentArray = [systemInstruction];
        if (userInput) contentArray.push(`Here is my raw history: ${userInput}`);
        if (imagePart) contentArray.push(imagePart);

        // FIXED: Reverted to the rock-solid gemini-pro model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(contentArray);

        res.json({ feedback: result.response.text() });

    } catch (error) {
        console.error('CV Builder Error:', error);
        res.status(500).json({ error: 'Failed to generate CV. Please try again.' });
    }
});

// =====================================================================
// ENDPOINT 2: CALENDAR PING TEST
// =====================================================================
app.get('/api/calendar-test', async (req, res) => {
    try {
        const response = await calendar.events.list({
            calendarId: MY_CALENDAR_ID,
            timeMin: (new Date()).toISOString(),
            maxResults: 5,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items;
        if (!events || events.length === 0) {
            res.json({ message: 'Connection successful! But your calendar is currently empty.' });
            return;
        }

        res.json({ 
            message: 'Connection successful! Here are your upcoming events:', 
            events: events.map(event => ({
                summary: event.summary,
                start: event.start.dateTime || event.start.date
            }))
        });

    } catch (error) {
        console.error('The Calendar Ping failed:', error);
        res.status(500).json({ error: 'Failed to read calendar. Check logs.', details: error.message });
    }
});

// =====================================================================
// ENDPOINT 3: THE AI SCHEDULER BRAIN
// =====================================================================
app.post('/api/chat-booking', async (req, res) => {
    try {
        const history = req.body.history;
        if (!history || history.length === 0) {
            return res.status(400).json({ error: 'Conversation history is required.' });
        }
        
        const formattedHistory = history.map(msg => `${msg.role}: ${msg.text}`).join('\n');

        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);

        const calendarResponse = await calendar.events.list({
            calendarId: MY_CALENDAR_ID, 
            timeMin: now.toISOString(),
            timeMax: nextWeek.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = calendarResponse.data.items;
        let busySlots = "Andrew's calendar is completely open this week.";
        
        if (events && events.length > 0) {
            busySlots = events.map(event => {
                const start = new Date(event.start.dateTime || event.start.date).toLocaleString('en-GB', { timeZone: 'Europe/London' });
                const end = new Date(event.end.dateTime || event.end.date).toLocaleString('en-GB', { timeZone: 'Europe/London' });
                return `- Busy from ${start} to ${end}`;
            }).join('\n');
        }

        const systemPrompt = `
        You are the 'OST Booking Guide', the highly intelligent front-desk assistant for Online Super Tutors (OST). 
        Your goal is to guide parents and students to the right tutor using a warm, frictionless, and slightly Socratic approach.
        
        Today's date and time is: ${now.toLocaleString('en-GB', { timeZone: 'Europe/London' })}.
        
        ### THE OST TUTOR FLEET (YOUR KNOWLEDGE BASE):
        * **Andrew Reid (Director):** The polymath founder. 12+ years’ experience. Teaches 14 subjects up to A-Level. 11+ specialist. GCSE Specialist in all core subjects as well as modern languages (French, Spanish, Italian, Portuguese). A Level Specialist – guides in selection process and instructs English, Spanish, Italian, Economics, Geography and Biology. University and Career Specialist – assists with UCAS applications, CV Building and job applications. Handles high-level consultations. He will guide the user through the entire process and is the first point of contact for all enquiries if possible.
        * **Samira Lambert:** Primary School, 11+ entrance exams, and KS3/GCSE English & Maths. Highly creative, personalized lessons.
        * **George Draganov:** The Science Expert. Master’s in chemistry from Imperial College. Teaches Chemistry, Physics, and Maths.
        * **Fatima Patel:** The Maths & Arabic Expert. 10 years teaching GCSE and A-Level Maths. Also teaches Classical Fusha Arabic.
        * **Lorena Justo Garcia:** Native Spanish tutor. Background in child psychology and learning strategies.
        * **Alistair Sutherland:** Music Specialist. Expert in piano, wind instruments and able to instruct and inspire a wide range of musical instruments. Expertise in music theory and composition.
        * **Lucy Adams:** Oxbridge language and communications expert who can teach all levels. Fully qualified teacher with 4 years teaching experience in both the Private and State sector, with proven track record of success, averaging an A at A level and a 9 at GCSE in both French and Spanish.
        * **James Martin Mugwanya:** Legal Expert. Can assist with many legal affairs from local to international. Law tutoring, university law admissions.

        ### YOUR INSTRUCTIONS:
        1. Read the CONVERSATION HISTORY below carefully. Do NOT ask for information the user has already provided.
        2. Act like Socrates: If you are missing crucial information, ask ONE warm, clarifying question.
        3. Once you know the specific subject AND level, MATCH them with the perfect tutor from the fleet list above. If the request is complex or covers multiple areas, recommend an initial consultation with Andrew.
        4. Briefly explain WHY that tutor is the perfect fit based on their bio.
        5. Ask if they would like to see that specific tutor's availability to book a session.
        6. Keep your responses short, conversational, and highly empathetic. Never sound like a robot.
        
        ### CONVERSATION HISTORY SO FAR:
        ${formattedHistory}
        
        RESPOND AS THE 'GUIDE' TO THE USER'S LAST MESSAGE:
        `;

        // FIXED: Reverted to the rock-solid gemini-pro model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(systemPrompt);
        
        res.json({ reply: result.response.text() });

    } catch (error) {
        console.error('AI Scheduler Error:', error);
        res.status(500).json({ error: 'Failed to process booking request. Check server logs.' });
    }
});

app.listen(port, () => {
    console.log(`🚀 Socratic Server is running on port ${port}`);
});