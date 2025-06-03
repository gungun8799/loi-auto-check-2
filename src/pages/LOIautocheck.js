import styles from './App.module.css';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { FileText, UploadCloud, Globe, Table, ListChecks } from 'lucide-react';

function AIVision() {
  const [files, setFiles] = useState([]);
  const [fileNames, setFileNames] = useState([]);
  const [extractedText, setExtractedText] = useState('');
  const [geminiText, setGeminiText] = useState('');
  const [pdfGemini, setPdfGemini] = useState('');
  const [loading, setLoading] = useState(false);
  const [promptKey, setPromptKey] = useState('');
  const [promptOptions, setPromptOptions] = useState([]);

  const [urlInput, setUrlInput] = useState('');
  const [scrapedText, setScrapedText] = useState('');
  const [scrapedGeminiText, setScrapedGeminiText] = useState('');
  const [webGemini, setWebGemini] = useState('');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [autoScrapeLoading, setAutoScrapeLoading] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [excelResult, setExcelResult] = useState('');
  const [excelGemini, setExcelGemini] = useState('');
  const [tempExcelFileName, setTempExcelFileName] = useState('');

  const [compareSourceA, setCompareSourceA] = useState('');
  const [compareSourceB, setCompareSourceB] = useState('');
  const [compareSourceC, setCompareSourceC] = useState('');
  const [compareResult, setCompareResult] = useState('');
  const [requiresLogin, setRequiresLogin] = useState(false);
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [selectedSystem, setSelectedSystem] = useState('');
    const [systemType, setSystemType] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [contractNumber, setContractNumber] = useState('');
    const [selectedPages, setSelectedPages] = useState('all'); // e.g., '1,2,3' or 'all'
    const [validationResult, setValidationResult] = useState(null);    
    const [sharepointPath, setSharepointPath] = useState('');
    const [error, setError] = useState(null); // State for capturing errors
    const [successMessage, setSuccessMessage] = useState(null); // State for success messages
    const [autoProcessLoading, setAutoProcessLoading] = useState(false); // Changed loading to autoProcessLoading
    const [scrapedPopupUrl, setScrapedPopupUrl] = useState('');
  

  useEffect(() => {
    if (compareSourceA && compareSourceB) {
      compareFields(); // Automatically trigger the compare logic after both sources are set
    }
  }, [compareSourceA, compareSourceB]);

  const onDrop = (acceptedFiles) => {
    setFiles(acceptedFiles);
    setFileNames(acceptedFiles.map(f => f.name));
  };

  const classifyContractType = async (ocrText) => {
    try {
      const res = await axios.post('http://localhost:5001/api/contract-classify', { ocrText });
      const type = res.data.contractType?.toLowerCase();  // Normalize case
  
      let selectedPrompt;
      if (type === 'permanent_fixed') {
        selectedPrompt = 'LOI_permanent_fixed_fields';
      } else if (type === 'service_express') {
        selectedPrompt = 'LOI_service_express_fields';
      } else {
        selectedPrompt = 'LOI_Doc_validation'; // fallback
      }
  
      setPromptKey(selectedPrompt); // still update UI
      console.log(`[🔍 Contract Type Detected] ${type}`);
      console.log(`[📌 Prompt selected based on contract type] ${selectedPrompt}`);
      return selectedPrompt;
    } catch (err) {
      console.error('[❌ Contract Classification Error]', err);
      return 'LOI_Doc_validation'; // safe fallback
    }
  };

  const saveCompareResultToFirebase = async (contractNumber, compareResult, pdfGemini, webGemini, validationResult, popupUrl) => {
    try {
      // ✅ Send the raw contractNumber with slashes
      await axios.post('http://localhost:5001/api/save-compare-result', {
        contractNumber, // not contractId
        compareResult,
        pdfGemini,
        webGemini,
        validationResult,
        popupUrl,
      });
  
      console.log(`[🔥 Saved compare result for ${contractNumber}]`);
    } catch (err) {
      console.error('❌ Error saving compare result to Firebase:', err);
    }
  };
  
  const handleLoginAndScrape = async () => {
    setScrapeLoading(true);
    setLoginError('');
    setScrapedText('');
    setScrapedGeminiText('');
  
    try {
      if (selectedSystem === 'Simplicity') {
        const res = await axios.post('http://localhost:5001/api/scrape-simplicity', {
          url: urlInput,
          username: loginUsername,
          password: loginPassword,
        });
        setScrapedText(res.data.html);
        setScrapedGeminiText('✅ Login & scrape success (Simplicity)');
      }
      // Add more systems here if needed
    } catch (err) {
      setLoginError('❌ Login failed or scraping failed.');
      console.error('Scrape error:', err);
    }
  
    setScrapeLoading(false);
  };
  
  

  const extractFiles = async () => {
    if (!files.length) return;
    setLoading(true);
  
    try {
      // === Process each file in turn ===
      for (const file of files) {

        const baseName = file.name.replace(/\.pdf$/i, '');
        const validPattern = /^\d+_(?:LO|LR)\d+_\d+$/;
        if (!validPattern.test(baseName)) {
          console.log(`[⏭️ Skip invalid filename] ${file.name}`);
          continue;
        }
        
        // === Step 1: Extract OCR text for this file ===
        const textOnlyForm = new FormData();
        textOnlyForm.append('file', file);
        textOnlyForm.append('pages', selectedPages);
  
        let ocrText;
        try {
          const ocrRes = await axios.post(
            'http://localhost:5001/api/extract-text-only',
            textOnlyForm,
            { headers: textOnlyForm.getHeaders?.() || {} }
          );
          ocrText = ocrRes.data.text;
        } catch (e) {
          console.warn(`⚠️ OCR failed for "${file.name}", skipping this file.`);
          continue;
        }
  
        if (!ocrText) {
          console.warn(`⚠️ No OCR text for "${file.name}", skipping this file.`);
          continue;
        }
  
        // === Step 2: Classify contract type ===
        let selectedPrompt;
        try {
          selectedPrompt = await classifyContractType(ocrText);
        } catch {
          console.warn(`⚠️ Classification failed for "${file.name}", skipping this file.`);
          continue;
        }
        if (!selectedPrompt) {
          console.warn(`⚠️ No prompt key for "${file.name}", skipping this file.`);
          continue;
        }
  
        // === Step 3: Extract full content with selectedPrompt ===
        const formData = new FormData();
        formData.append('files', file);
        formData.append('promptKey', selectedPrompt);
        formData.append('pages', selectedPages || 'all');
  
        let textResponse;
        try {
          const res = await axios.post('http://localhost:5001/api/extract-text', formData);
          textResponse = res.data;
          setExtractedText(res.data.text);
          setGeminiText(res.data.geminiOutput);
          setPdfGemini(res.data.geminiOutput);
        } catch {
          console.warn(`⚠️ extract-text API failed for "${file.name}", skipping this file.`);
          continue;
        }
  
        console.log(`[✅ Using final promptKey "${selectedPrompt}" for "${file.name}"]`);
  
        // === Step 4: Parse contract number from Gemini output ===
        let raw = textResponse.geminiOutput.trim();
        if (raw.startsWith('```json')) raw = raw.slice(7);
        if (raw.endsWith('```')) raw = raw.slice(0, -3);
  
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace < 0 || lastBrace < 0) {
          console.warn(`⚠️ Invalid JSON in Gemini output for "${file.name}", skipping.`);
          continue;
        }
  
        const jsonBlock = raw.substring(firstBrace, lastBrace + 1);
        let parsed;
        try {
          parsed = JSON.parse(jsonBlock);
        } catch {
          console.warn(`⚠️ JSON.parse failed for "${file.name}", skipping.`);
          continue;
        }
  
        const extractedContract = parsed?.['Contract Number']?.trim();
        if (!extractedContract) {
          console.warn(`⚠️ No "Contract Number" field in Gemini output for "${file.name}", skipping.`);
          continue;
        }
  
        // === Step 5: Auto-login & scrape for this contract ===
        setAutoScrapeLoading(true);
        setSystemType('simplicity');
        setUsername('TH40184213');
        setPassword('u@@U5410154');
        setContractNumber(extractedContract);
  
        console.log(`[🔐 AutoLogin for "${file.name}" → ${extractedContract}]`);
        let loginRes;
        try {
          loginRes = await axios.post('http://localhost:5001/api/scrape-login', {
            systemType: 'simplicity',
            username: 'TH40184213',
            password: 'u@@U5410154',
          });
        } catch {
          console.warn(`❌ AutoLogin request failed for "${file.name}".`);
          setAutoScrapeLoading(false);
          continue;
        }
        if (!loginRes.data.success) {
          console.warn(`❌ AutoLogin rejected for "${file.name}".`);
          setAutoScrapeLoading(false);
          continue;
        }
  
        console.log(`[🚀 AutoScrape for "${file.name}" → ${extractedContract}]`);
        let scrapeRes;
        try {
          scrapeRes = await axios.post('http://localhost:5001/api/scrape-url', {
            systemType: 'simplicity',
            promptKey: selectedPrompt,
            contractNumber: extractedContract,
          });
        } catch {
          console.warn(`❌ Scrape-URL request failed for "${file.name}".`);
          setAutoScrapeLoading(false);
          continue;
        }
        setScrapedPopupUrl(scrapeRes.data.popupUrl);
  
        if (!scrapeRes.data.success) {
          console.warn(`❌ scrape-url failed for "${file.name}".`);
          setAutoScrapeLoading(false);
          continue;
        }
  
        setScrapedText(scrapeRes.data.raw);
        setScrapedGeminiText(scrapeRes.data.geminiOutput);
        console.log(`[✅ Auto Scrape Done for "${file.name}"]`);
  
        // === Step 6: Compare fields (PDF vs Web) & save to Firebase ===
        setCompareSourceA('pdf');
        setCompareSourceB('web');
        try {
          await compareFields();
        } catch (e) {
          console.warn(`⚠️ compareFields failed for "${file.name}".`);
        }
  
        // === Step 7: Web validation step ===
        try {
          let rawWeb = scrapeRes.data.geminiOutput.trim();
          if (rawWeb.startsWith('```json')) rawWeb = rawWeb.slice(7);
          if (rawWeb.endsWith('```')) rawWeb = rawWeb.slice(0, -3);
          const fb = rawWeb.indexOf('{'),
            lb = rawWeb.lastIndexOf('}');
          const jsonBlockWeb = rawWeb.substring(fb, lb + 1);
          const parsedWeb = JSON.parse(jsonBlockWeb);
  
          await axios.post('http://localhost:5001/api/web-validate', {
            contractNumber: extractedContract,
            extractedData: parsedWeb,
            promptKey,
          });
          console.log(`[🧠 Web Validation Triggered for "${file.name}"]`);
        } catch {
          console.warn(`⚠️ web-validate failed for "${file.name}".`);
        }
  
        // === Step 8: Document validation (after a short delay) ===
        await new Promise((r) => setTimeout(r, 10000));
        await runDocumentValidation();
  
        setAutoScrapeLoading(false);
        console.log(`[✅ Finished processing "${file.name}"]`);
      }
    } catch (err) {
      console.error('❌ Error in extractFiles loop', err);
    } finally {
      setLoading(false);
    }
  };



  const scrapeUrl = async () => {
    if (!urlInput) return;
    setScrapeLoading(true);
    setLoginError('');
    setScrapedText('');
    setScrapedGeminiText('');
  
    try {
      const res = await axios.post('http://localhost:5001/api/scrape-popup-login', {
        url: urlInput,
      });
  
      if (res.data && res.data.success) {
        setScrapedText(res.data.html);
        setScrapedGeminiText('✅ Scraped after popup login');
  
        // Process the Gemini response
        const geminiResponse = res.data.geminiOutput;
        let raw = geminiResponse.trim();
        if (raw.startsWith('```json')) raw = raw.slice(7);
        if (raw.endsWith('```')) raw = raw.slice(0, -3);
  
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        const jsonBlock = raw.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonBlock);
  
        // Extract the contract number
        const contractNumber = parsed?.['Contract Number']?.trim();
        if (contractNumber) {
          // Extract Lease Type and Workflow status
          const leaseType = parsed?.['Lease Type'] || 'N/A';
          const workflowStatus = parsed?.['Workflow status'] || 'N/A';
  
          // Save the data to Firebase using the new function
          await saveCompareResultToFirebase(contractNumber, { 'Lease Type': leaseType, 'Workflow status': workflowStatus }, geminiResponse, res.data.geminiOutput);
  
          // Automatically set sources for comparison
          setCompareSourceA('pdf');  // Set Source A as PDF
          setCompareSourceB('web');  // Set Source B as Web Scrape
        }
      } else {
        setLoginError('❌ Failed to scrape after login.');
      }
    } catch (err) {
      console.error('Scrape error:', err);
      setLoginError('❌ Scrape failed. Please check console.');
    }
  
    setScrapeLoading(false);
  };
  
  
  
  
  
  
  

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    setExcelFile(file);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('http://localhost:5001/api/get-sheet-names', formData);
      setSheetNames(res.data.sheetNames);
      setTempExcelFileName(res.data.tempFileName);
    } catch (err) {
      alert('Failed to read sheet names');
    }
  };

  const processExcelSheet = async () => {
    if (!selectedSheet || !tempExcelFileName) return;

    try {
      const res = await axios.post('http://localhost:5001/api/process-sheet', {
        sheetName: selectedSheet,
        fileName: tempExcelFileName,
        promptKey: promptKey,
      });

      setExcelResult(JSON.stringify(res.data.table, null, 2));
      setExcelGemini(res.data.geminiOutput);
    } catch (err) {
      alert('Failed to process sheet');
    }
  };

  const compareFields = async () => {
    const selected = [compareSourceA, compareSourceB, compareSourceC].filter(Boolean);
    if (!selected.length) {
      setCompareResult('❌ Please select at least two sources to compare.');
      return;
    }
  
    try {
      const res = await axios.post('http://localhost:5001/api/fetch-latest-json', {
        sources: selected,
      });
  
      const results = res.data.results;
      const formattedSources = {};
  
      for (const src of selected) {
        try {
          console.log(`[Parse Attempt] Source: ${src}`);
          console.log(`[Raw JSON from Server] ${results[src]}`);
  
          // Clean trailing non-JSON text
          const raw = results[src].trim();
          const firstBrace = raw.indexOf('{');
          const lastBrace = raw.lastIndexOf('}');
          const jsonBlock = raw.substring(firstBrace, lastBrace + 1);
  
          formattedSources[src] = JSON.parse(jsonBlock);  // ✅ safer parse
          console.log(`[Parsed JSON: ${src}]`, formattedSources[src]);
          if (formattedSources.web && scrapedGeminiText) {
            try {
              let rawWeb = scrapedGeminiText.trim();
              if (rawWeb.startsWith('```json')) rawWeb = rawWeb.slice(7);
              if (rawWeb.endsWith('```')) rawWeb = rawWeb.slice(0, -3);
              const firstBrace = rawWeb.indexOf('{');
              const lastBrace = rawWeb.lastIndexOf('}');
              const jsonBlockWeb = rawWeb.substring(firstBrace, lastBrace + 1);
              const parsedWeb = JSON.parse(jsonBlockWeb);
          
              // ✅ Override with live scraped text
              formattedSources.web = parsedWeb;
          
              console.log(`[🧠 Override web source with in-memory scrapedGeminiText]`, parsedWeb);
            } catch (err) {
              console.warn('[⚠️ Failed to override web source]', err);
            }
          }
        } catch (err) {
          console.error(`❌ JSON parse error for source ${src}:`, err);
          setCompareResult(`❌ Failed to parse ${src} response as JSON.`);
          return;
        }
      }
  
      const compareRes = await axios.post('http://localhost:5001/api/gemini-compare', {
        formattedSources,
        promptKey,
      });
      console.log('[🐞 Raw Gemini Compare Response]', compareRes.data.response);
      let cleaned = compareRes.data.response.trim();
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  
      try {
        const parsedTable = JSON.parse(cleaned);
        setCompareResult(parsedTable);
  
        // 🔍 Attempt to get contract number from any parsed JSON (pdf preferred)
        const contractField = formattedSources.pdf?.['Contract Number']
          || formattedSources.web?.['Contract Number']
          || formattedSources.excel?.['Contract Number']
          || 'unknown_contract';
        const contractId = contractField.replace(/\//g, '_');
  
        console.log('[📝 Saving comparison result to Firestore]', contractId);
  
        await axios.post('http://localhost:5001/api/save-compare-result', {
          contractNumber: contractId,
          compareResult: parsedTable,
          pdfGemini,
          webGemini: scrapedGeminiText,
          validationResult,
          popupUrl: scrapedPopupUrl // or dynamically extracted
        });
      } catch (err) {
        console.error('❌ Failed to parse Gemini comparison JSON output:', err);
        setCompareResult(compareRes.data.response);
      }
    } catch (err) {
      setCompareResult('❌ Error fetching or comparing data.');
      console.error(err);
    }
    // ✅ After compare result is saved, automatically trigger validation
    runDocumentValidation();

  };
  
  const runDocumentValidation = async () => {
    // 1) First wait (up to 30s) until pdfGemini contains at least one “{” and one “}”
    let raw = (pdfGemini || '').trim();
    const maxRetries = 30;
    let attempt = 0;
  
    while (
      // stop once we see at least one “{” and one “}” somewhere in pdfGemini
      (!(raw.includes('{') && raw.includes('}'))) &&
      attempt < maxRetries
    ) {
      attempt++;
      await new Promise(r => setTimeout(r, 1000));
      raw = (pdfGemini || '').trim();
    }
  
    // If after 30s there was no “{” and “}” at all, bail out
    if (!(raw.includes('{') && raw.includes('}'))) {
      console.warn(
        `[⚠️ Validation] No JSON‐like braces found in pdfGemini after ${maxRetries} seconds; skipping validation.`
      );
      return;
    }
  
    // 2) Strip off Markdown fences if present
    if (raw.startsWith('```json')) {
      raw = raw.slice(7);
    }
    if (raw.endsWith('```')) {
      raw = raw.slice(0, -3);
    }
  
    // 3) Now isolate from first “{” to last “}”
    const firstBrace = raw.indexOf('{');
    const lastBrace  = raw.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
      console.warn(
        '[⚠️ Validation] Could not find matching “{…}” block even after braces appeared; skipping validation.'
      );
      return;
    }
    const jsonBlock = raw.substring(firstBrace, lastBrace + 1);
    console.log('[🧠 Extracted JSON block]', jsonBlock);
  
    // 4) Try to parse that substring
    let parsed;
    try {
      parsed = JSON.parse(jsonBlock);
      console.log('[✅ Parsed OCR JSON Object]', parsed);
    } catch (err) {
      console.warn(
        '[⚠️ Error parsing OCR JSON—skipping validation payload]',
        err.message
      );
      return;
    }
  
    // 5) Send the parsed object to /api/validate-document
    let validateRes;
    try {
      validateRes = await axios.post(
        'http://localhost:5001/api/validate-document',
        {
          extractedData: parsed,
          promptKey,
        }
      );
    } catch (err) {
      console.error('[❌ Validation API request failed]', err.message || err);
      return;
    }
  
    // 6) Clean up the returned “```json … ```” text
    let rawValidation = (validateRes.data.validation || '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/, '')
      .trim();
    console.log('[🧹 Cleaned Validation JSON String]', rawValidation);
  
    // 7) Escape any stray backslashes that would break JSON.parse
    rawValidation = rawValidation.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
  
    // 8) Parse the validation result
    let parsedResult;
    try {
      parsedResult = JSON.parse(rawValidation);
      console.log('[📋 Final Parsed Validation Object]', parsedResult);
    } catch (err) {
      console.error('[❌ Error parsing validation JSON]', err.message || err);
      return;
    }
  
    // 9) Update React state
    setValidationResult(parsedResult);
  
    // 10) Save to Firestore via backend
    const contractField = parsed?.['Contract Number'] || 'unknown_contract';
    const contractId    = contractField.replace(/\//g, '_');
    try {
      await axios.post('http://localhost:5001/api/save-validation-result', {
        contractNumber: contractId,
        validationResult: parsedResult,
      });
      console.log(`[🔥 Saved validation_result for ${contractId} to Firestore]`);
    } catch (err) {
      console.error(
        '[❌ Error saving validation_result to Firestore]',
        err.message || err
      );
    }
  };
  
  const runDocumentValidationDirect = async (parsedData) => {
    // parsedData is already a JS object from geminiOutput
    console.log('[🧠 Parsed OCR JSON Object (direct)]', parsedData);
  
    let validateRes;
    try {
      validateRes = await axios.post(
        'http://localhost:5001/api/validate-document',
        {
          extractedData: parsedData,
          promptKey, // still coming from your React state
        }
      );
    } catch (err) {
      console.error('[❌ Validation API request failed]', err.message || err);
      return;
    }
  
    // Strip the Markdown fences out of validateRes.data.validation
    const rawValidation = validateRes.data.validation
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/, '')
      .trim();
    console.log('[🧹 Cleaned Validation JSON String (direct)]', rawValidation);
  
    let parsedResult;
    try {
      parsedResult = JSON.parse(rawValidation);
      console.log('[📋 Final Parsed Validation Object (direct)]', parsedResult);
    } catch (err) {
      console.error('[❌ Error parsing validation JSON (direct)]', err.message || err);
      return;
    }
  
    // Update React state so your UI shows it
    setValidationResult(parsedResult);
  
    // Save to your backend / Firestore
    const contractField = parsedData?.['Contract Number'] || 'unknown_contract';
    const contractId = contractField.replace(/\//g, '_');
    try {
      await axios.post('http://localhost:5001/api/save-validation-result', {
        contractNumber: contractId,
        validationResult: parsedResult,
      });
      console.log(`[🔥 Saved validation_result for ${contractId} to Firestore]`);
    } catch (err) {
      console.error('[❌ Error saving validation_result to Firestore]', err.message || err);
    }
  };

  const autoProcessContracts = async () => {
    setLoading(true); // Start loading indicator
  
    try {
      // Send a request to the backend to process PDF files
      const res = await axios.post('http://localhost:5001/api/auto-process-pdf-folder', {
        folderPath: sharepointPath, // Pass the folder path (could be from SharePoint or local path)
      });
  
      // Check if the response indicates success
      if (res.data.success) {
        // If successful, display a success message and alert
        setSuccessMessage(`✅ Auto processing started: ${res.data.processedCount} file(s) processed.`);
        alert(`✅ Auto processing started: ${res.data.processedCount} file(s) processed.`);
        
        // Optionally, trigger the next step in your process (e.g., scraping, validation) here
      } else {
        // If no files were processed or found, show an error
        setError('⚠️ No new files found or nothing was processed.');
        alert('⚠️ No new files found or nothing was processed.');
      }
    } catch (err) {
      // Handle different error scenarios (e.g., endpoint not found or server error)
      console.error('[Auto Processing Error]', err);
  
      if (err.response?.status === 404) {
        setError('❌ Endpoint not found: /api/auto-process-pdf-folder. Please check your backend route.');
        alert('❌ Endpoint not found: /api/auto-process-pdf-folder. Please check your backend route.');
      } else if (err.response?.status === 500) {
        setError('❌ Server error occurred. Please try again later.');
        alert('❌ Server error occurred. Please try again later.');
      } else {
        setError('❌ Failed to process PDF contracts.');
        alert('❌ Failed to process PDF contracts.');
      }
    } finally {
      setLoading(false); // Stop loading indicator when the process is done
    }
  };

  // Save to Firebase backend
  
  const renderComparisonTable = () => {
    if (!Array.isArray(compareResult)) {
      return <pre>{compareResult}</pre>; // fallback
    }
  
    const sources = ['pdf', 'web', 'excel'];
  
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Field</th>
            {sources.map(src => (
              <th key={src} style={cellStyle}>{src.toUpperCase()}</th>
            ))}
            <th style={cellStyle}>Match</th>
          </tr>
        </thead>
        <tbody>
          {compareResult.map((row, idx) => (
            <tr key={idx}>
              <td style={cellStyle}>{row.field}</td>
              {sources.map(src => (
                <td key={src} style={cellStyle}>
                  {typeof row[src] === 'object' ? JSON.stringify(row[src]) : row[src] ?? '—'}
                </td>
              ))}
              <td style={cellStyle}>{row.match ? '✅' : '❌'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };


  const renderValidationTable = () => {
    if (!Array.isArray(validationResult)) return null;
  
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '2rem' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Field</th>
            <th style={cellStyle}>Value</th>
            <th style={cellStyle}>Valid</th>
            <th style={cellStyle}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {validationResult.map((row, idx) => (
            <tr key={idx}>
              <td style={cellStyle}>{row.field}</td>
              <td style={cellStyle}>{row.value ?? '—'}</td>
              <td style={cellStyle}>
                {row.valid ? '✅' : '❌'}
              </td>
              <td style={cellStyle}>{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };
  
  const cellStyle = {
    border: '1px solid #ccc',
    padding: '0.5rem',
    textAlign: 'left',
    fontSize: '0.95rem',
  };
  

  const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: '.pdf,.png,.jpg,.jpeg' });

  return (
    <div className={styles.App}>
      <div className={styles.container} style={{ flexDirection: 'column', alignItems: 'center'  }}>
        {/* Row 1: Prompt & Compare Selector */}
        <div className={styles.topBarRow}>
          

          <div className={styles.compareSelectorWrapper}>
            

          {
            autoProcessLoading ? (
              // Display "Loading..." text while auto processing is in progress
              <div>Loading...</div>
            ) : (
              <button 
                className={styles.button_autoprocess} 
                onClick={autoProcessContracts}
                disabled={autoProcessLoading} // Disable the button while loading
              >
                ⚙️ Start Auto Processing
              </button>
            )
          }
          


            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '1rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginTop: '0.5rem',
                }}
                >
                <select className={styles.input} value={compareSourceA} onChange={e => setCompareSourceA(e.target.value)}>
                    <option value="">Source A</option>
                    <option value="pdf">PDF/Image</option>
                    <option value="web">Web Scrape</option>
                    <option value="excel">Excel/CSV</option>
                </select>

                <select className={styles.input} value={compareSourceB} onChange={e => setCompareSourceB(e.target.value)}>
                    <option value="">Source B</option>
                    <option value="pdf">PDF/Image</option>
                    <option value="web">Web Scrape</option>
                    <option value="excel">Excel/CSV</option>
                </select>

                <select className={styles.input} value={compareSourceC} onChange={e => setCompareSourceC(e.target.value)}>
                    <option value="">Source C (optional)</option>
                    <option value="pdf">PDF/Image</option>
                    <option value="web">Web Scrape</option>
                    <option value="excel">Excel/CSV</option>
                </select>

                <button onClick={compareFields} className={styles.button}>
                    Compare
                </button>
                </div>
          </div>
        </div>

        {/* Row 2: Upload Panels */}
        <div className={styles.uploadPanelsRow}>
          <div className={styles.panel}>
            <h2><UploadCloud size={20} /> Upload PDF/Images</h2>
            <div {...getRootProps({ className: styles.dropzone })}>
              <input {...getInputProps()} />
              <p>Drag & drop or click to upload</p>
            </div>
            <div style={{ marginTop: '1rem' }}>
  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Pages to Extract:</label>
  
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                type="text"
                className={styles.input}
                value={selectedPages}
                onChange={(e) => setSelectedPages(e.target.value)}
                placeholder="e.g. 1,2,3"
                disabled={selectedPages === 'all'}
                style={{ flex: 1, backgroundColor: selectedPages === 'all' ? '#f0f0f0' : 'white' }}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                    type="checkbox"
                    checked={selectedPages === 'all'}
                    onChange={(e) => setSelectedPages(e.target.checked ? 'all' : '')}
                />
                All Pages
                </label>
            </div>
            
            </div>
            {fileNames.length > 0 && (
              <ul className={styles.fileList}>
                {fileNames.map((name, i) => <li key={i}>{name}</li>)}
              </ul>
            )}
            <button onClick={extractFiles} className={styles.button}>
              {loading ? 'Extracting...' : 'Extract'}
            </button>
            {extractedText && (
              <div className={styles.resultBlock}>
                <h3>OCR Text</h3>
                <pre>{extractedText}</pre>
                <h3>Gemini Output</h3>
                <pre>{geminiText}</pre>

                </div>
                
            )}
{geminiText && (
  <>
  

    <button
      onClick={runDocumentValidation}
      className={styles.button}
      style={{ marginTop: '1rem' }}
    >
      🧠 Validate Document
    </button>
  </>
)}
          </div>

          
          

          {/* Scrape Web Page Panel */}
          <div className={styles.panel}>
          <div className={styles.panel}>
  <h2><Globe size={20} /> Scrape Web Page</h2>

  <label>System Type</label>
  <select
    value={systemType}
    onChange={(e) => {
      setSystemType(e.target.value);
      setIsLoggedIn(false);
      setContractNumber('');
    }}
    className={styles.input}
  >
    <option value="">-- Select System --</option>
    <option value="simplicity">Simplicity</option>
    <option value="others">Others</option>
  </select>

  {systemType && systemType !== 'others' && (
  <>
    <input
      type="text"
      className={styles.input}
      placeholder="Username"
      value={username}
      onChange={(e) => setUsername(e.target.value)}
    />
    <input
      type="password"
      className={styles.input}
      placeholder="Password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
    />
    <button
      className={styles.button}
      onClick={async () => {
        try {
          const res = await axios.post('http://localhost:5001/api/scrape-login', {
            systemType,
            username,
            password,
          });
          console.log('[Login response]', res.data);
          if (res.data.success) {
            setIsLoggedIn(true);
            setLoginError('');
          } else {
            setLoginError('❌ Login failed');
          }
        } catch (err) {
          console.error('Login error:', err);
          setLoginError('❌ Login failed');
        }
      }}
    >
      Login
    </button>

    {loginError && <div style={{ color: 'red', marginTop: '8px' }}>{loginError}</div>}
    {systemType === 'simplicity' && isLoggedIn && (
  <>
    <input
      type="text"
      className={styles.input}
      placeholder="Enter Contract Number"
      value={contractNumber}
      onChange={(e) => setContractNumber(e.target.value)}
    />
    <button
      className={styles.button}
      style={{ marginTop: '1rem' }}
      onClick={async () => {
        try {
          const res = await axios.post('http://localhost:5001/api/scrape-url', {
            systemType: 'simplicity',
            promptKey,
            contractNumber,
          });
          if (res.data.success) {
            alert('✅ scrape-url step succeeded!');
            console.log('[Scrape URL response]', res.data);
            setScrapedText(res.data.raw);
            setScrapedGeminiText(res.data.geminiOutput);
          } else {
            alert('❌ scrape-url step failed');
          }
        } catch (err) {
          console.error('[Scrape URL error]', err);
          alert('❌ scrape-url request failed');
        }
      }}
    >
      🔍 Search & Scrape
    </button>
  </>
)}
  </>
)}

  {/* URL input for other systems only */}
  {systemType === 'others' && (
    <>
      <input
        type="text"
        className={styles.input}
        placeholder="Paste URL here"
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
      />
      <button onClick={scrapeUrl} className={styles.button}>
        {scrapeLoading ? 'Scraping...' : 'Scrape'}
      </button>
    </>
  )}

  {scrapedText && (
    <div className={styles.resultBlock}>
      <h3>Scraped Text</h3>
      <pre>{scrapedText}</pre>
      <h3>Gemini Output</h3>
      <pre>{scrapedGeminiText}</pre>
    </div>
  )}
</div>

        </div>


          <div className={styles.panel}>
            <h2><Table size={20} /> Excel/CSV Upload</h2>
            <input
              type="file"
              className={styles.input}
              accept=".xlsx, .xls, .csv"
              onChange={handleExcelUpload}
            />
            {sheetNames.length > 0 && (
              <>
                <label>Select Sheet:</label>
                <select
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                  className={styles.input}
                >
                  <option value="">-- Choose Sheet --</option>
                  {sheetNames.map((name, i) => (
                    <option key={i} value={name}>{name}</option>
                  ))}
                </select>
                <button onClick={processExcelSheet} className={styles.button}>Process Sheet</button>
              </>
            )}
            {excelResult && (
              <div className={styles.resultBlock}>
                <h3>Raw Table</h3>
                <pre>{excelResult}</pre>
                <h3>Gemini Output</h3>
                <pre>{excelGemini}</pre>
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Compare Result */}
        {(compareResult || validationResult) && (
  <div className={styles.panel_2} style={{ marginTop: '2rem', width: '100%' }}>
    <h2><ListChecks size={20} /> Comparison & Validation Result</h2>

    {compareResult && renderComparisonTable()}

    {validationResult && (
      <div style={{ marginTop: '2rem' }}>
        <h3>📋 Document Validation Result</h3>

        {/* Render if result is a list of field-level objects */}
        {Array.isArray(validationResult) ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Field</th>
                <th style={cellStyle}>Value</th>
                <th style={cellStyle}>Valid</th>
                <th style={cellStyle}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {validationResult.map((row, idx) => (
                <tr key={idx}>
                  <td style={cellStyle}>{row.field}</td>
                  <td style={cellStyle}>{row.value ?? '—'}</td>
                  <td style={cellStyle}>{row.valid ? '✅' : '❌'}</td>
                  <td style={cellStyle}>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          // Fallback: render key-value summary if not an array
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>Check</th>
                <th style={cellStyle}>Result</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(validationResult).map(([key, value], idx) => (
                <tr key={idx}>
                  <td style={cellStyle}>{key}</td>
                  <td style={cellStyle}>
                    {typeof value === 'boolean'
                      ? value === true
                        ? '❌'
                        : '✅'
                      : typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )}
  </div>
)}
 

      </div>
    </div>
  );
}

export default AIVision;
