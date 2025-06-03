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
    const fetchPromptOptions = async () => {
      try {
        const res = await axios.get('http://localhost:5001/api/prompts');
        setPromptOptions(res.data.promptKeys);
        setPromptKey(res.data.promptKeys[0] || '');
      } catch (err) {
        console.error('Failed to fetch prompts:', err);
      }
    };
    fetchPromptOptions();
  }, []);

  useEffect(() => {
    if (compareSourceA && compareSourceB) {
      compareFields(); // Automatically trigger the compare logic after both sources are set
    }
  }, [compareSourceA, compareSourceB]);

  const onDrop = (acceptedFiles) => {
    setFiles(acceptedFiles);
    setFileNames(acceptedFiles.map(f => f.name));
  };

  

  const saveCompareResultToFirebase = async (contractNumber, compareResult, pdfGemini, webGemini, validationResult, popupUrl) => {
    try {
      const contractId = contractNumber.replace(/\//g, '_'); // ✅ sanitized
      const leaseType = compareResult['Lease Type'] || 'N/A';
      const workflowStatus = compareResult['Workflow status'] || 'N/A';
  
      await axios.post('http://localhost:5001/api/save-compare-result', {
        contractNumber: contractId,
        compareResult: {
          'Lease Type': leaseType,
          'Workflow status': workflowStatus,
        },
        pdfGemini,
        webGemini,
        validationResult,
        popupUrl,
      });
  
      console.log(`[🔥 Saved compare result for ${contractId}]`);
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
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('promptKey', promptKey);
      formData.append('pages', selectedPages);
  
      const res = await axios.post('http://localhost:5001/api/extract-text', formData);
      setExtractedText(res.data.text);
      setGeminiText(res.data.geminiOutput);
      setPdfGemini(res.data.geminiOutput);
  
      let raw = res.data.geminiOutput.trim();
      if (raw.startsWith('```json')) raw = raw.slice(7);
      if (raw.endsWith('```')) raw = raw.slice(0, -3);
  
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      const jsonBlock = raw.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonBlock);
      const extractedContract = parsed?.['Contract Number']?.trim();
  
      if (extractedContract) {
        setAutoScrapeLoading(true);
        const cleanContract = extractedContract.replace(/\//g, '_');
        setSystemType('simplicity');
        setUsername('TH40184213');
        setPassword('P@ssword12345');
        setContractNumber(extractedContract);
  
        console.log('[🔐 AutoLogin] Logging into Simplicity...');
        const loginRes = await axios.post('http://localhost:5001/api/scrape-login', {
          systemType: 'simplicity',
          username: 'TH40184213',
          password: 'P@ssword12345'
        });
  
        if (loginRes.data.success) {
          setIsLoggedIn(true);
          console.log('[✅ AutoLogin Success] Now scraping...');
  
          const scrapeRes = await axios.post('http://localhost:5001/api/scrape-url', {
            systemType: 'simplicity',
            promptKey,
            contractNumber: extractedContract,
          });
  
          setScrapedPopupUrl(scrapeRes.data.popupUrl);
  
          if (scrapeRes.data.success) {
            setScrapedText(scrapeRes.data.raw);
            setScrapedGeminiText(scrapeRes.data.geminiOutput);
            console.log('[✅ Auto Scrape Done]');
  
            setCompareSourceA('pdf');
            setCompareSourceB('web');
            await compareFields();
  
            try {
              let rawWeb = scrapeRes.data.geminiOutput.trim();
              if (rawWeb.startsWith('```json')) rawWeb = rawWeb.slice(7);
              if (rawWeb.endsWith('```')) rawWeb = rawWeb.slice(0, -3);
  
              const firstBrace = rawWeb.indexOf('{');
              const lastBrace = rawWeb.lastIndexOf('}');
              const jsonBlockWeb = rawWeb.substring(firstBrace, lastBrace + 1);
              const parsedWeb = JSON.parse(jsonBlockWeb);
  
              await axios.post('http://localhost:5001/api/web-validate', {
                contractNumber: extractedContract,
                extractedData: parsedWeb,
                promptKey,
              });
  
              console.log('[🧠 Web Validation Triggered]');
            } catch (err) {
              console.error('[❌ Failed to trigger web validation]', err);
            }
  
            // ✅ Safe document validation + save flow
            setTimeout(async () => {
              const validationOutput = await runDocumentValidation();
  
              try {
                const contractId = extractedContract.replace(/\//g, '_');
                await saveCompareResultToFirebase(
                  extractedContract,
                  compareResult,
                  pdfGemini,
                  scrapeRes.data.geminiOutput,
                  validationOutput,
                  scrapeRes.data.popupUrl
                );
  
                console.log('[🔥 Final compare_result saved after validation]');
              } catch (err) {
                console.warn('[⚠️ Final Save Failed]', err.message || err);
              }
            }, 10000);
  
          } else {
            console.warn('[❌ Auto Scrape Failed]');
          }
        } else {
          console.warn('[❌ AutoLogin Failed]');
        }
  
        setAutoScrapeLoading(false);
      }
  
    } catch (err) {
      alert('Error extracting files');
      console.error(err);
      setAutoScrapeLoading(false);
    }
  
    setLoading(false);
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
          let raw = results[src]?.trim?.() || '';
          const firstBrace = raw.indexOf('{');
          const lastBrace = raw.lastIndexOf('}');
          const jsonBlock = raw.substring(firstBrace, lastBrace + 1);
          formattedSources[src] = JSON.parse(jsonBlock);
  
          if (src === 'web' && scrapedGeminiText) {
            let rawWeb = scrapedGeminiText.trim();
            if (rawWeb.startsWith('```json')) rawWeb = rawWeb.slice(7);
            if (rawWeb.endsWith('```')) rawWeb = rawWeb.slice(0, -3);
            const first = rawWeb.indexOf('{');
            const last = rawWeb.lastIndexOf('}');
            formattedSources.web = JSON.parse(rawWeb.substring(first, last + 1));
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
  
      let cleaned = compareRes.data.response.trim();
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      const parsedTable = JSON.parse(cleaned);
      setCompareResult(parsedTable);
  
      // Save to Firebase
      const contractNumber =
        formattedSources.pdf?.['Contract Number'] ||
        formattedSources.web?.['Contract Number'] ||
        'unknown_contract';
  
      const contractId = contractNumber.replace(/\//g, '_');
  
      await axios.post('http://localhost:5001/api/save-compare-result', {
        contractNumber: contractId,
        compareResult: parsedTable,
        pdfGemini,
        webGemini: scrapedGeminiText,
        validationResult, // already set earlier
        popupUrl: scrapedPopupUrl,
      });
  
      console.log(`[🔥 compare_result] Saved for: ${contractId}`);
  
      // 🧠 Trigger validation AFTER comparison + save
      runDocumentValidation();
  
    } catch (err) {
      console.error('❌ Compare Error:', err);
      setCompareResult('❌ Error comparing extracted data.');
    }
  };
  
  const runDocumentValidation = async () => {
    try {
      let parsed;
  
      if (typeof pdfGemini === 'string') {
        let raw = pdfGemini.trim();
        if (raw.startsWith('```json')) raw = raw.slice(7);
        if (raw.endsWith('```')) raw = raw.slice(0, -3);
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
          console.warn('[⚠️ JSON Block Not Found] Skipping validation.');
          return null;
        }
  
        const jsonBlock = raw.substring(firstBrace, lastBrace + 1);
        parsed = JSON.parse(jsonBlock);
  
      } else if (typeof pdfGemini === 'object' && pdfGemini !== null) {
        parsed = pdfGemini;
      } else {
        console.warn('[⚠️ Invalid Gemini format]');
        return null;
      }
  
      const validateRes = await axios.post('http://localhost:5001/api/validate-document', {
        extractedData: parsed,
        promptKey,
      });
  
      let output = (validateRes.data.validation || '').trim();
      if (output.startsWith('```json')) output = output.slice(7);
      if (output.endsWith('```')) output = output.slice(0, -3);
  
      const parsedResult = JSON.parse(output);
      setValidationResult(parsedResult);
  
      const contractId = (parsed['Contract Number'] || 'unknown_contract').replace(/\//g, '_');
      await axios.post('http://localhost:5001/api/save-validation-result', {
        contractNumber: contractId,
        validationResult: parsedResult,
      });
  
      console.log(`[🔥 compare_result] Validation result saved for: ${contractId}`);
      return parsedResult;
  
    } catch (err) {
      console.warn('[⚠️ runDocumentValidation error]', err.message || err);
      return null;  // 💡 Never throw, always return null so the flow can continue
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
          <div className={styles.promptSelectorWrapper}>
            <label htmlFor="promptSelect">Select Prompt Template:</label>
            <select
              id="promptSelect"
              value={promptKey}
              onChange={(e) => setPromptKey(e.target.value)}
              className={styles.input}
            >
                {promptOptions
                //.filter(key => !['LOI_Doc_validation', 'LOI_permanent_fixed_fields_compare','contract_compare'].includes(key)) // exclude these
                .map((key, idx) => (
                    <option key={idx} value={key}>{key}</option>
                ))}
            </select>
          </div>

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
