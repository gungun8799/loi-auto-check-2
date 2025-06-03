import styles from './App.module.css';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { FileText, UploadCloud } from 'lucide-react';

function AIVision() {
  const [files, setFiles] = useState([]);
  const [fileNames, setFileNames] = useState([]);
  const [extractedText, setExtractedText] = useState('');
  const [geminiText, setGeminiText] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [promptKey, setPromptKey] = useState('');
  const [promptOptions, setPromptOptions] = useState([]);

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

      // Extract PO number from the Gemini response
      if (res.data.poNumber) {
        setPoNumber(res.data.poNumber);
        savePoNumberToFirebase(res.data.poNumber, res.data.geminiOutput);
      }
    } catch (err) {
      console.error('Error extracting files:', err);
    }
    setLoading(false);
  };

  const savePoNumberToFirebase = async (poNumber, geminiOutput) => {
    try {
      await axios.post('http://localhost:5001/api/save-po-number', {
        poNumber,
        geminiOutput
      });
      console.log('PO number saved to Firebase:', poNumber);
    } catch (err) {
      console.error('Error saving PO number to Firebase:', err);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: '.pdf,.png,.jpg,.jpeg',
  });

  return (
    <div className={styles.App}>
      <div className={styles.container}>
        <div {...getRootProps({ className: styles.dropzone })}>
          <input {...getInputProps()} />
          <p>Drag & drop PDF files here, or click to select files</p>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <select
            value={promptKey}
            onChange={(e) => setPromptKey(e.target.value)}
            className={styles.input}
          >
            {promptOptions.map((key, idx) => (
              <option key={idx} value={key}>{key}</option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button onClick={extractFiles} className={styles.button}>
            {loading ? 'Extracting...' : 'Extract'}
          </button>
        </div>
        {fileNames.length > 0 && (
          <ul className={styles.fileList}>
            {fileNames.map((name, i) => <li key={i}>{name}</li>)}
          </ul>
        )}
        {extractedText && (
          <div className={styles.resultBlock}>
            <h3>Extracted Text</h3>
            <pre>{extractedText}</pre>
            <h3>Gemini Output</h3>
            <pre>{geminiText}</pre>
          </div>
        )}
        {poNumber && (
          <div className={styles.resultBlock}>
            <h3>PO Number</h3>
            <pre>{poNumber}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default AIVision;