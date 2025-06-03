import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();
const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json());

// Firebase Admin Init
const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, './firebase-adminsdk.json'), 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Gemini AI Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Extract Text and Call Gemini
app.post('/api/extract-text', upload.array('files'), async (req, res) => {
  const files = req.files;
  const promptKey = req.body.promptKey || 'invoice_match';
  const extractedText = [];
  
  if (!files?.length) {
    return res.status(400).json({ message: 'No files uploaded' });
  }

  // Read the selected prompt template
  const promptFilePath = path.join(__dirname, 'prompts', `${promptKey}.txt`);
  if (!fs.existsSync(promptFilePath)) {
    return res.status(400).json({ message: `Prompt template '${promptKey}' not found.` });
  }
  const promptTemplate = fs.readFileSync(promptFilePath, 'utf8');

  // Process each file
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    const localFilePath = path.join(__dirname, file.path);
    const fileName = path.basename(file.originalname, ext);
    let fileText = '';

    if (ext === '.pdf') {
      // Handle PDF extraction (use your preferred method for PDF text extraction)
      // For now, we'll just simulate with dummy text
      fileText = `Extracted text from ${fileName}.pdf`;
    } else {
      // Handle image file extraction
      fileText = `Extracted text from image ${fileName}`;
    }

    extractedText.push(fileText);
    fs.unlinkSync(localFilePath); // Clean up uploaded file
  }

  const combinedText = extractedText.join('\n\n');

  // Send extracted text to Gemini model
  const finalPrompt = `${promptTemplate}\n\nText:\n${combinedText}`;
  try {
    const geminiRes = await model.generateContent(finalPrompt);
    const geminiText = await geminiRes.response.text();

    // Attempt to extract PO number from Gemini response
    let poNumber = 'unknown_PO';  // Default value if PO number is not found
    try {
      const cleaned = geminiText.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      poNumber = parsed["PO Number"] || 'unknown_PO';  // Assuming "PO Number" field is present in the response
    } catch (err) {
      console.warn('Failed to extract PO number:', err.message);
    }

    // Save extracted text and PO number to Firebase in the 'AP_Non_Trade_Invoice' collection
    const docId = poNumber.replace(/\//g, '_');  // Use PO number as document ID
    await db.collection('AP_Non_Trade_Invoice').doc(docId).set({
      timestamp: new Date(),
      poNumber,
      extracted_text: combinedText,
      gemini_response: geminiText,
      prompt_key: promptKey,
    });

    console.log(`[🔥 Firebase] Document saved with PO number: ${poNumber}`);

    // Respond with extracted text and Gemini output
    res.json({ success: true, text: combinedText, geminiOutput: geminiText, poNumber });
  } catch (err) {
    console.error('Gemini request failed:', err);
    res.status(500).json({ message: 'Failed to get response from Gemini', error: err.message });
  }
});

app.post('/api/save-po-number', async (req, res) => {
    const { poNumber, geminiOutput } = req.body;
  
    if (!poNumber) {
      return res.status(400).json({ message: 'PO Number is required' });
    }
  
    try {
      // Save PO number and Gemini output in Firebase
      const docId = poNumber.replace(/\//g, '_');  // Use PO number as document ID
      await db.collection('AP_Non_Trade_Invoice').doc(docId).set({
        timestamp: new Date(),
        poNumber,
        gemini_response: geminiOutput,
      });
  
      console.log(`[🔥 Firebase] Document saved with PO number: ${poNumber}`);
      res.json({ success: true, message: 'PO number saved to Firebase' });
    } catch (err) {
      console.error('Error saving PO number to Firebase:', err);
      res.status(500).json({ message: 'Failed to save PO number to Firebase', error: err.message });
    }
  });

// Start the server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});