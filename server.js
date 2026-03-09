require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const { google } = require('googleapis');

// =====================================================================
// SERVER INITIALIZATION
// =====================================================================
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Essential for the new Chat Booking endpoint!

// File upload handler for the CV Builder
const upload = multer({ storage: multer.memoryStorage() });

// =====================================================================
// AI & API AUTHENTICATION
// =====================================================================

// 1. Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 2. Initialize Google Calendar API
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

// The email address of your primary tutoring calendar
const MY_CALENDAR_ID = 'info@onlinesupertutors.org'; 


// =====================================================================
// ENDPOINT 1: THE CV BUILDER
// =====================================================================
app.post('/api/build-cv', upload.single('image'), async (req, res) => {
    try {
        const mode = req.body.mode;
        let userInput = req.body.text || '';
        let imagePart = null;

        // If photo mode, prep the image for Gemini
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

        // Call Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contentArray
        });

        res.json({ feedback: response.text });

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
        const userMessage = req.body.message;
        if (!userMessage) {
            return res.status(400).json({ error: 'Message is required.' });
        }
        
        // 1. Get Andrew's schedule for the next 7 days
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

        // 2. Build the Master Prompt for Gemini
        const systemPrompt = `
        You are the 'Socratic Scheduler', a highly efficient, premium booking assistant for Andrew Reid (an elite tutor).
        
        Today's date and time is: ${now.toLocaleString('en-GB', { timeZone: 'Europe/London' })}.
        
        Andrew's working hours are generally 9:00 AM to 7:00 PM, Monday to Friday.
        
        Here is a list of times Andrew is CURRENTLY BOOKED and UNAVAILABLE over the next 7 days:
        ${busySlots}
        
        Your Instructions:
        1. Help the user find a free time slot for a tutoring session.
        2. Be conversational, warm, and highly professional.
        3. DO NOT hallucinate or make up available times. Cross-reference Andrew's working hours with his busy list above.
        4. If the user asks for a time that is busy, politely apologize and suggest 2 alternative times that are free.
        5. Keep your responses concise (like a WhatsApp message), not a long email.
        
        User message: "${userMessage}"
        `;

        // 3. Consult Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: systemPrompt
        });

        const aiReply = response.text;

        // 4. Send the AI's response back to the frontend
        res.json({ reply: aiReply });

    } catch (error) {
        console.error('AI Scheduler Error:', error);
        res.status(500).json({ error: 'Failed to process booking request. Check server logs.' });
    }
});


// =====================================================================
// START THE SERVER
// =====================================================================
app.listen(port, () => {
    console.log(`🚀 Socratic Server is running on port ${port}`);
});