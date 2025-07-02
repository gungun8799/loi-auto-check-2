// ===== AIVision.jsx =====
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { FileText, UploadCloud, Globe, Table, ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from './App.module.css';

function AIVision() {
  const navigate = useNavigate();

  // ─── Logout handler ─────────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  // ─── State hooks ─────────────────────────────────────────────────────────────
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
  const [validationResult, setValidationResult] = useState(null);
  const [webValidationResult, setWebValidationResult] = useState(null);
  const [meterValidationResult, setMeterValidationResult] = useState(null);
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';


  // ─── Fetch available prompt keys on mount ────────────────────────────────────
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

  // ─── Dropzone setup ──────────────────────────────────────────────────────────
  const onDrop = (acceptedFiles) => {
    setFiles(acceptedFiles);
    setFileNames(acceptedFiles.map((f) => f.name));
  };
  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: '.pdf,.png,.jpg,.jpeg',
  });

  // ─── Document validation handler ─────────────────────────────────────────────
  const handleDocumentValidation = async () => {
    if (!pdfGemini) return;
    try {
      // Strip fences and isolate JSON
      let raw = pdfGemini.trim();
      if (raw.startsWith('```json')) raw = raw.slice(7);
      if (raw.endsWith('```')) raw = raw.slice(0, -3);
      const b1 = raw.indexOf('{'),
        b2 = raw.lastIndexOf('}');
      const jsonBlock = raw.substring(b1, b2 + 1);
      const parsed = JSON.parse(jsonBlock);

      // Call the API
      const res = await axios.post('http://localhost:5001/api/validate-document', {
        extractedData: parsed,
        promptKey,
      });

      // Clean response
      let v = res.data.validation.trim();
      if (v.startsWith('```json')) v = v.slice(7);
      if (v.endsWith('```')) v = v.slice(0, -3);
      setValidationResult(JSON.parse(v));
    } catch (err) {
      console.error('Document validation failed', err);
      setValidationResult([
        {
          field: 'Error',
          value: err.message,
          valid: false,
          reason: 'See console',
        },
      ]);
    }
  };

  // ─── Render a validation table ────────────────────────────────────────────────
  const renderValidationTable = (data) => {
    if (!Array.isArray(data)) {
      return <pre>{JSON.stringify(data, null, 2)}</pre>;
    }
    const cellStyle = {
      border: '1px solid #ccc',
      padding: '0.5rem',
      textAlign: 'left',
      fontSize: '0.95rem',
    };
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Field</th>
            <th style={cellStyle}>Value</th>
            <th style={cellStyle}>Valid</th>
            <th style={cellStyle}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              <td style={cellStyle}>{row.field}</td>
              <td style={cellStyle}>{row.value ?? '—'}</td>
              <td style={cellStyle}>{row.valid ? '✅' : '❌'}</td>
              <td style={cellStyle}>{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ─── Web validation handler ──────────────────────────────────────────────────
  const handleWebValidation = async () => {
    if (!scrapedGeminiText || !contractNumber) return;
    try {
      // Strip fences and isolate JSON
      let raw = scrapedGeminiText.trim();
      if (raw.startsWith('```json')) raw = raw.slice(7);
      if (raw.endsWith('```')) raw = raw.slice(0, -3);
      const b1 = raw.indexOf('{'),
        b2 = raw.lastIndexOf('}');
      const jsonBlock = raw.substring(b1, b2 + 1);
      const parsed = JSON.parse(jsonBlock);

      // Call the API
      const res = await axios.post('http://localhost:5001/api/web-validate', {
        contractNumber,
        extractedData: parsed,
        promptKey,
      });

      setWebValidationResult(res.data.validationResult);
      setMeterValidationResult(res.data.meterValidation || null);
    } catch (err) {
      console.error('Web validation failed', err);
      setWebValidationResult([
        {
          field: 'Error',
          value: err.message,
          valid: false,
          reason: 'See console',
        },
      ]);
      setMeterValidationResult(null);
    }
  };

  // ─── Handle file‐based extraction ────────────────────────────────────────────
  const extractFiles = async () => {
    if (!files.length) return;
    setLoading(true);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('promptKey', promptKey);

      const res = await axios.post('http://localhost:5001/api/extract-text', formData);
      setExtractedText(res.data.text);
      setGeminiText(res.data.geminiOutput);
      setPdfGemini(res.data.geminiOutput);
    } catch (err) {
      alert('Error extracting files');
    }
    setLoading(false);
  };

  // ─── Check if login required before scraping ─────────────────────────────────
  const checkLoginRequirement = async () => {
    try {
      const res = await axios.post('http://localhost:5001/api/check-login-required', {
        url: urlInput,
      });
      setRequiresLogin(res.data.requiresLogin);
    } catch (err) {
      alert('Error checking login requirement.');
    }
  };

  // ─── Scrape (popup‐login) ─────────────────────────────────────────────────────
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
      } else {
        setLoginError('❌ Failed to scrape after login.');
      }
    } catch (err) {
      console.error('Scrape error:', err);
      setLoginError('❌ Scrape failed. Please check console.');
    }

    setScrapeLoading(false);
  };

  // ─── Excel upload & processing ────────────────────────────────────────────────
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
        promptKey,
      });
      setExcelResult(JSON.stringify(res.data.table, null, 2));
      setExcelGemini(res.data.geminiOutput);
    } catch (err) {
      alert('Failed to process sheet');
    }
  };

  // ─── Compare fields across sources ────────────────────────────────────────────
  const compareFields = async () => {
    const selected = [compareSourceA, compareSourceB, compareSourceC].filter(Boolean);
    if (selected.length < 2) {
      setCompareResult('❌ Please select at least two sources to compare.');
      return;
    }

    try {
      // 1) Fetch latest JSON strings
      const fetchRes = await axios.post('http://localhost:5001/api/fetch-latest-json', {
        sources: selected,
      });
      const rawResults = fetchRes.data.results;

      const formattedSources = {};
      for (const src of selected) {
        let raw = rawResults[src] || '';
        raw = raw.trim();
        if (raw.startsWith('```json')) raw = raw.slice(7);
        if (raw.endsWith('```')) raw = raw.slice(0, -3);
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        const jsonBlock =
          firstBrace >= 0 && lastBrace > firstBrace
            ? raw.substring(firstBrace, lastBrace + 1)
            : raw;
        formattedSources[src] = JSON.parse(jsonBlock);
      }

      // If “web” is one of the sources, override with in‐memory scrape
      if (formattedSources.web && scrapedGeminiText) {
        let w = scrapedGeminiText.trim();
        if (w.startsWith('```json')) w = w.slice(7);
        if (w.endsWith('```')) w = w.slice(0, -3);
        const b1 = w.indexOf('{'),
          b2 = w.lastIndexOf('}');
        formattedSources.web = JSON.parse(w.substring(b1, b2 + 1));
      }

      // 5) Call Gemini compare
      const cmpRes = await axios.post('http://localhost:5001/api/gemini-compare', {
        formattedSources,
        promptKey,
      });

      // 6) Clean and parse Gemini’s JSON table
      let cmpRaw = cmpRes.data.response.trim();
      if (cmpRaw.startsWith('```json')) cmpRaw = cmpRaw.slice(7);
      if (cmpRaw.endsWith('```')) cmpRaw = cmpRaw.slice(0, -3);
      const compareArray = JSON.parse(cmpRaw);

      setCompareResult(compareArray);
    } catch (err) {
      console.error('❌ compareFields error:', err);
      setCompareResult('❌ Error during comparison.');
    }
  };

  const renderComparisonTable = () => {
    if (!Array.isArray(compareResult)) {
      return <pre>{compareResult}</pre>;
    }
    const cellStyle = {
      border: '1px solid #ccc',
      padding: '0.5rem',
      textAlign: 'left',
      fontSize: '0.95rem',
    };
    const sources = ['pdf', 'web', 'excel'];
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Field</th>
            {sources.map((src) => (
              <th key={src} style={cellStyle}>
                {src.toUpperCase()}
              </th>
            ))}
            <th style={cellStyle}>Match</th>
          </tr>
        </thead>
        <tbody>
          {compareResult.map((row, idx) => (
            <tr key={idx}>
              <td style={cellStyle}>{row.field}</td>
              {sources.map((src) => (
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

  return (
    <div className={styles.App}>
      {/* ─── Logout button in top‐right ────────────────────────────────────────── */}
      <div style={{ width: '100%', textAlign: 'right', padding: '1rem 2rem 0 2rem' }}>
        <button className={styles.logoutButton} onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div className={styles.container} style={{ flexDirection: 'column', alignItems: 'center' }}>
        {/* ─── Row 1: Prompt & Compare Selector ───────────────────────────────────── */}
        <div className={styles.topBarRow}>
          <div className={styles.promptSelectorWrapper}>
            <label htmlFor="promptSelect">Select Prompt Template:</label>
            <select
              id="promptSelect"
              value={promptKey}
              onChange={(e) => setPromptKey(e.target.value)}
              className={styles.input}
            >
              <option value="">-- Choose Prompt --</option>
              {promptOptions.map((key, idx) => (
                <option key={idx} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.compareSelectorWrapper}>
            <label>Compare Extracted Data:</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                className={styles.input}
                value={compareSourceA}
                onChange={(e) => setCompareSourceA(e.target.value)}
              >
                <option value="">Source A</option>
                <option value="pdf">PDF/Image</option>
                <option value="web">Web Scrape</option>
                <option value="excel">Excel/CSV</option>
              </select>
              <select
                className={styles.input}
                value={compareSourceB}
                onChange={(e) => setCompareSourceB(e.target.value)}
              >
                <option value="">Source B</option>
                <option value="pdf">PDF/Image</option>
                <option value="web">Web Scrape</option>
                <option value="excel">Excel/CSV</option>
              </select>
              <select
                className={styles.input}
                value={compareSourceC}
                onChange={(e) => setCompareSourceC(e.target.value)}
              >
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

        {/* ─── Row 2: Upload Panels ───────────────────────────────────────────────── */}
        <div className={styles.uploadPanelsRow}>
          <div className={styles.panel}>
            <h2>
              <UploadCloud size={20} /> Upload PDF/Images
            </h2>
            <div {...getRootProps({ className: styles.dropzone })}>
              <input {...getInputProps()} />
              <p>Drag & drop or click to upload</p>
            </div>
            {fileNames.length > 0 && (
              <ul className={styles.fileList}>
                {fileNames.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
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

            <button onClick={handleDocumentValidation} className={styles.button}>
              🧠 Validate Document
            </button>
            {validationResult && renderValidationTable(validationResult)}
          </div>

          {/* ─── Scrape Web Page Panel ────────────────────────────────────────────── */}
          <div className={styles.panel}>
            <h2>
              <Globe size={20} /> Scrape Web Page
            </h2>

            <label>System Type</label>
            <select
              value={systemType}
              onChange={(e) => {
                setSystemType(e.target.value);
                setLoginError('');
                setScrapedText('');
                setScrapedGeminiText('');
                setUsername('');
                setPassword('');
                setContractNumber('');
              }}
              className={styles.input}
            >
              <option value="">-- Select System --</option>
              <option value="simplicity">Simplicity</option>
              <option value="others">Others</option>
            </select>

            {/* Combined Login & Scrape for Simplicity */}
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
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Contract Number"
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                />
                <button
                  className={styles.button}
                  onClick={async () => {
                    setScrapeLoading(true);
                    setLoginError('');
                    try {
                      const res = await axios.post('http://localhost:5001/api/scrape-url-test', {
                        systemType,
                        username,
                        password,
                        contractNumber,
                        promptKey,
                      });
                      if (res.data.success) {
                        setScrapedText(res.data.raw);
                        setScrapedGeminiText(res.data.geminiOutput);
                      } else {
                        setLoginError(`❌ ${res.data.message}`);
                      }
                    } catch (err) {
                      console.error('Login & Scrape error:', err);
                      setLoginError('❌ Login & scrape failed');
                    }
                    setScrapeLoading(false);
                  }}
                >
                  {scrapeLoading ? 'Processing…' : 'Login & Scrape'}
                </button>
                {loginError && (
                  <div style={{ color: 'red', marginTop: '8px' }}>{loginError}</div>
                )}
              </>
            )}

            {/* Legacy “Others” flow */}
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
                  {scrapeLoading ? 'Scraping…' : 'Scrape'}
                </button>
              </>
            )}

            {/* Display results */}
            {scrapedText && (
              <div className={styles.resultBlock}>
                <h3>Scraped Text</h3>
                <pre>{scrapedText}</pre>
                <h3>Gemini Output</h3>
                <pre>{scrapedGeminiText}</pre>
              </div>
            )}

            <button onClick={handleWebValidation} className={styles.button} style={{ marginTop: '1rem' }}>
              🌐 Validate Web
            </button>
            {webValidationResult && renderValidationTable(webValidationResult)}
            {meterValidationResult && (
              <>
                <h3 style={{ marginTop: '1.5rem' }}>⚡ Meter Validation Result</h3>
                {renderValidationTable(meterValidationResult)}
              </>
            )}
          </div>

          {/* ─── Excel/CSV Upload Panel ────────────────────────────────────────────── */}
          <div className={styles.panel}>
            <h2>
              <Table size={20} /> Excel/CSV Upload
            </h2>
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
                    <option key={i} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button onClick={processExcelSheet} className={styles.button}>
                  Process Sheet
                </button>
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

        {/* ─── Row 3: Compare Result ───────────────────────────────────────────────── */}
        {compareResult && (
          <div className={styles.panel_2} style={{ marginTop: '2rem', width: '100%' }}>
            <h2>
              <ListChecks size={20} /> Comparison Result
            </h2>
            {renderComparisonTable()}
          </div>
        )}
      </div>
    </div>
  );
}

export default AIVision;