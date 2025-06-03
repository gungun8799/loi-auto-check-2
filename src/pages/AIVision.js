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

  const onDrop = (acceptedFiles) => {
    setFiles(acceptedFiles);
    setFileNames(acceptedFiles.map(f => f.name));
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

      const res = await axios.post('http://localhost:5001/api/extract-text', formData);
      setExtractedText(res.data.text);
      setGeminiText(res.data.geminiOutput);
      setPdfGemini(res.data.geminiOutput);
    } catch (err) {
      alert('Error extracting files');
    }
    setLoading(false);
  };

  const checkLoginRequirement = async () => {
    try {
      const res = await axios.post('http://localhost:5001/api/check-login-required', { url: urlInput });
      setRequiresLogin(res.data.requiresLogin);
    } catch (err) {
      alert('Error checking login requirement.');
    }
  };


  const getCookiesWithURL = (url) => {
    const cookieString = document.cookie || '';
    const cookies = cookieString.split(';').map(c => {
      const [name, ...rest] = c.trim().split('=');
      return {
        name,
        value: rest.join('='),
        url // MUST include this field for Puppeteer to accept the cookie
      };
    });
    return cookies;
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
          formattedSources[src] = JSON.parse(results[src]);
          console.log(`[Parsed JSON: ${src}]`, formattedSources[src]);
        } catch (err) {
          console.error(`❌ JSON parse error for source ${src}:`, err);
          setCompareResult(`❌ Failed to parse ${src} response as JSON.`);
          return;
        }
      }
  
      const compareRes = await axios.post('http://localhost:5001/api/gemini-compare', {
        formattedSources,
        promptKey, // Pass through prompt template for tailored comparison
      });
  
      let cleaned = compareRes.data.response.trim();
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  
      try {
        const parsedTable = JSON.parse(cleaned);
        setCompareResult(parsedTable);
      } catch (err) {
        console.error('❌ Failed to parse Gemini comparison JSON output:', err);
        setCompareResult(compareRes.data.response); // fallback: raw text
      }
    } catch (err) {
      setCompareResult('❌ Error fetching or comparing data.');
      console.error(err);
    }
  };
  
  
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
              <option value="">-- Choose Prompt --</option>
              {promptOptions.map((key, idx) => (
                <option key={idx} value={key}>{key}</option>
              ))}
            </select>
          </div>

          <div className={styles.compareSelectorWrapper}>
            <label>Compare Extracted Data:</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
              <button onClick={compareFields} className={styles.button}>Compare</button>
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
        {compareResult && (
            <div className={styles.panel_2} style={{ marginTop: '2rem', width: '100%' }}>
                <h2><ListChecks size={20} /> Comparison Result</h2>
                {renderComparisonTable()}
            </div>
            )}

      </div>
    </div>
  );
}

export default AIVision;
