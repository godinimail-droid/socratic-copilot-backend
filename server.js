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
        
        if (events && events