import React, { useEffect, useState } from 'react';
import axios from 'axios';
import styles from './LOIDashboard.module.css';
import { useNavigate } from 'react-router-dom';
import { BarChartBig, RefreshCcw } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import * as XLSX from 'xlsx';



import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Title,
} from 'chart.js';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Title);

function LOIDashboard({ user }) {
  const navigate = useNavigate(); 
  const [contracts, setContracts] = useState([]);
  const [filteredContracts, setFilteredContracts] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [weekStats, setWeekStats] = useState({});
  // at the top of LOIDashboard(), right after your other useState calls:
const [editingWorkflowFor, setEditingWorkflowFor] = useState(null);
  const [refreshingContracts, setRefreshingContracts] = useState({});
  const [filters, setFilters] = useState({
    workflowStatus: '',
    tenantType: '',
    status: '',
    search: ''
  });
  const [leadStatuses, setLeadStatuses] = useState({});
  const handleLogout = () => {
   localStorage.removeItem('user');
   navigate('/login', { replace: true });
 };

  const [exportFrom, setExportFrom] = useState(''); // e.g. "2025-06-01"
const [exportTo, setExportTo] = useState('');     // e.g. "2025-06-10"
    // ─── New state hooks for “export from/to” ─────────────────────────────────
    const [exportFromRaw, setExportFromRaw] = useState('');
    const [exportToRaw, setExportToRaw] = useState('');

    // ─── New state for “Start Auto Processing” ───────────────────────────────────
    const [loadingAuto, setLoadingAuto] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const [errorAuto, setErrorAuto] = useState(null);
    const [sharepointPath, setSharepointPath] = useState('');
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('http://localhost:5001/api/get-compare-results');
        if (res.data.success && Array.isArray(res.data.data)) {
          const rawContracts = res.data.data;
          setContracts(rawContracts);
          setFilteredContracts(rawContracts);
          computeWeeklyStats(rawContracts);
          
        }
      } catch (err) {
        console.error('❌ Failed to fetch compare_result data:', err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, contracts]);

  const applyFilters = () => {
    let filteredData = contracts;
    if (filters.search) {
      filteredData = filteredData.filter(contract => 
        contract.contract_number?.toLowerCase().includes(filters.search.toLowerCase()) ||
        contract.workflow_status?.toLowerCase().includes(filters.search.toLowerCase()) ||
        contract.tenant_type?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }
    if (filters.workflowStatus) {
      filteredData = filteredData.filter(contract => contract.workflow_status === filters.workflowStatus);
    }
    if (filters.tenantType) {
      filteredData = filteredData.filter(contract => contract.tenant_type === filters.tenantType);
    }
    if (filters.status) {
      filteredData = filteredData.filter(contract => isValid(contract) === (filters.status === 'Passed'));
    }
    setFilteredContracts(filteredData);
  };

  const toggleDetails = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const isValid = (item) => {
    const validationValid = Array.isArray(item.validation_result)
      ? item.validation_result.every(row => row.valid === true)
      : false;
    const compareValid = Array.isArray(item.compare_result)
      ? item.compare_result.every(row => row.match === true)
      : false;
    return validationValid && compareValid;
  };

  const computeWeeklyStats = (contracts) => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());

    const countByDay = {
      Sunday: 0, Monday: 0, Tuesday: 0,
      Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0
    };

    contracts.forEach(c => {
      const date = c.timestamp?.toDate?.() || new Date(c.timestamp);
      if (date >= weekStart) {
        const day = date.toLocaleDateString('en-US', { weekday: 'long' });
        countByDay[day]++;
      }
    });

    setWeekStats(countByDay);
  };

  const passedCount = filteredContracts.filter(c => isValid(c)).length;
  const reviewCount = filteredContracts.length - passedCount;

  const handleExport = () => {
    exportBetween(exportFromRaw, exportToRaw);
    // 1) Log the raw “from” / “to” strings
    console.log('▶️ Export From (raw):', exportFromRaw);
    console.log('▶️ Export To   (raw):', exportToRaw);
  
    // 2) Parse those into JS Dates.
    //    • “from” at 00:00:00
    //    • “to”   at 23:59:59.999
    let fromDate = null,
        toDate = null;
  
    if (exportFromRaw) {
      fromDate = new Date(exportFromRaw);
      fromDate.setHours(0, 0, 0, 0);
    }
    if (exportToRaw) {
      toDate = new Date(exportToRaw);
      toDate.setHours(23, 59, 59, 999);
    }
  
    console.log('▶️ Parsed fromDate:', fromDate);
    console.log('▶️ Parsed toDate:  ', toDate);
  
    // 3) Build a new array, filtering by timestamp range
    const inRange = filteredContracts.filter((contract) => {
      const ts = contract.timestamp;
      console.log(`  • [${contract.contract_number}] raw timestamp:`, ts);
  
      let actualDate = null;
  
      // 3a) If it's a Firestore Timestamp object, use its .toDate()
      if (ts && typeof ts.toDate === 'function') {
        actualDate = ts.toDate();
        console.log(`    → via .toDate(): ${actualDate.toString()}`);
      }
      // 3b) If it’s a plain JSON with _seconds/_nanoseconds
      else if (ts && ts._seconds != null) {
        const sec = ts._seconds;
        const nano = ts._nanoseconds || 0;
        actualDate = new Date(sec * 1000 + nano / 1e6);
        console.log(`    → via _seconds/_nanoseconds: ${actualDate.toString()}`);
      }
      // 3c) Or if it has seconds/nanoseconds without underscores
      else if (ts && ts.seconds != null) {
        const sec = ts.seconds;
        const nano = ts.nanoseconds || 0;
        actualDate = new Date(sec * 1000 + nano / 1e6);
        console.log(`    → via seconds/nanoseconds: ${actualDate.toString()}`);
      }
      // 3d) Otherwise, try to treat ts as a normal JS date string / Date
      else {
        actualDate = new Date(ts);
        console.log(`    → via new Date(ts): ${actualDate.toString()}`);
      }
  
      // 3e) If invalid, skip it
      if (!actualDate || isNaN(actualDate.getTime())) {
        console.warn(
          `    ❌ [${contract.contract_number}] invalid Date → excluded`
        );
        return false;
      }
  
      // 4) If either fromDate or toDate is set, enforce range.
      if (fromDate && actualDate < fromDate) {
        console.warn(
          `    ❌ [${contract.contract_number}] before fromDate → excluded`
        );
        return false;
      }
      if (toDate && actualDate > toDate) {
        console.warn(
          `    ❌ [${contract.contract_number}] after toDate → excluded`
        );
        return false;
      }
  
      // If we reach here, it’s in range
      return true;
    });
  
    console.log('▶️ Contracts in-range count:', inRange.length);
  
    // 5) Map those to “flattened” objects for Excel
    const cleanedContracts = inRange.map((contract) => {
      // Destructure out big nested fields we don’t need in Excel
      const {
        pdf_extracted,
        web_extracted,
        compare_result,
        validation_result,
        web_validation_result,
        meter_validation_result,
        gemini_output,
        popup_url,
        ...keep
      } = contract;
  
      // Convert the timestamp to "DD-MMM-YYYY"
      const tsString = formatDate(contract.timestamp);
  
      return {
        ...keep,
        timestamp: tsString,
      };
    });
  
    // 6) Finally, create the worksheet & write file
    const ws = XLSX.utils.json_to_sheet(cleanedContracts);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contracts');
    XLSX.writeFile(wb, 'contracts.xlsx');
  };

  // 1. create exportBetween(fromRaw, toRaw) helper
const exportBetween = (fromRaw, toRaw) => {
  console.log('▶️ exportBetween fromRaw:', fromRaw);
  console.log('▶️ exportBetween toRaw:  ', toRaw);

  let fromDate = null, toDate = null;
  if (fromRaw) {
    fromDate = new Date(fromRaw);
    fromDate.setHours(0, 0, 0, 0);
  }
  if (toRaw) {
    toDate = new Date(toRaw);
    toDate.setHours(23, 59, 59, 999);
  }
  console.log('▶️ exportBetween parsed fromDate:', fromDate);
  console.log('▶️ exportBetween parsed toDate:  ', toDate);

  const inRange = filteredContracts.filter(contract => {
    const ts = contract.timestamp;
    console.log(`  • [${contract.contract_number}] raw timestamp:`, ts);

    let actualDate = null;
    if (ts && ts._seconds != null) {
      // Firestore‐style JSON
      actualDate = new Date(ts._seconds * 1000 + (ts._nanoseconds || 0) / 1e6);
    } else if (ts && ts.seconds != null) {
      // plain “seconds” variant
      actualDate = new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6);
    } else {
      actualDate = new Date(ts);
    }

    console.log('    → parsed actualDate:', actualDate);
    if (isNaN(actualDate.getTime())) {
      console.warn(`    ❌ [${contract.contract_number}] invalid Date → excluded`);
      return false;
    }
    if (fromDate && actualDate < fromDate) {
      console.warn(`    ❌ [${contract.contract_number}] before fromDate → excluded`);
      return false;
    }
    if (toDate && actualDate > toDate) {
      console.warn(`    ❌ [${contract.contract_number}] after toDate → excluded`);
      return false;
    }
    return true;
  });

  console.log('▶️ exportBetween in-range count:', inRange.length);

  const cleaned = inRange.map(contract => {
    const {
      pdf_extracted,
      web_extracted,
      compare_result,
      validation_result,
      web_validation_result,
      meter_validation_result,
      gemini_output,
      popup_url,
      ...keep
    } = contract;
    return {
      ...keep,
      timestamp: formatDate(contract.timestamp),
    };
  });

  const ws = XLSX.utils.json_to_sheet(cleaned);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contracts');
  XLSX.writeFile(wb, 'contracts.xlsx');
};

  const handleLeadStatusChange = async (contractId, status) => {
    setLeadStatuses(prev => ({ ...prev, [contractId]: status }));
    try {
      await axios.post('http://localhost:5001/api/update-lead-status', {
        contractNumber: contractId.replace(/_/g, '/'),
        leadStatus: status,
      });
      console.log(`[✅ Lead status for ${contractId} updated to ${status}`);
    } catch (error) {
      console.error(`[❌ Error updating lead status for ${contractId}]`, error);
    }
  };

  const forceProcessFile = async (contractNumber) => {
    try {
      const res = await axios.post('http://localhost:5001/api/force-process-contract', {
        contractNumber
      });
      if (res.data.success) alert('✅ Forced processing started.');
      else alert('❌ Failed to start forced process.');
    } catch (err) {
      alert('❌ Error during forced process.');
      console.error(err);
    }
  };

  const autoProcessContracts = async () => {
    setLoadingAuto(true); // Start loading indicator
  
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
        setErrorAuto('⚠️ No new files found or nothing was processed.');
        alert('⚠️ No new files found or nothing was processed.');
      }
    } catch (err) {
      // Handle different error scenarios (e.g., endpoint not found or server error)
      console.error('[Auto Processing Error]', err);
  
      if (err.response?.status === 404) {
        setErrorAuto('❌ Endpoint not found: /api/auto-process-pdf-folder. Please check your backend route.');
        alert('❌ Endpoint not found: /api/auto-process-pdf-folder. Please check your backend route.');
      } else if (err.response?.status === 500) {
        setErrorAuto('❌ Server error occurred. Please try again later.');
        alert('❌ Server error occurred. Please try again later.');
      } 
    } finally {
      setLoadingAuto(false); // Stop loading indicator when the process is done
    }
  };

  // Inside LOIDashboard(), after handleExport:
// ─── “Today’s Report” handler ─────────────────────────────────────────────────
// 3. modify handleTodaysReport to compute “YYYY-MM-DD” and call exportBetween(...)
const handleTodaysReport = () => {
  // compute today’s date as “YYYY-MM-DD”
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1)
  .padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayString = `${yyyy}-${mm}-${dd}`;

  // directly call exportBetween with todayString
  exportBetween(todayString, todayString);
};

  const handleWorkflowStatusChange = async (contractNumber, chosenStatus) => {
    // If the user didn’t actually select anything (empty string), do nothing
    if (!chosenStatus) {
      return;
    }
  
    // 1. Confirm with the user before sending
    const confirmed = window.confirm(
      `Are you sure you want to change ${contractNumber} → "${chosenStatus}"?`
    );
    if (!confirmed) {
      return;
    }
  
    // 2. Send to backend
    try {
      await axios.post('http://localhost:5001/api/update-workflow-status', {
        contractNumber,
        workflowStatus: chosenStatus
      });
  
      // 3. Update local state immediately so UI reflects it
      setContracts(prev =>
        prev.map(c =>
          c.contract_number === contractNumber
            ? { ...c, workflow_status: chosenStatus }
            : c
        )
      );
      setFilteredContracts(prev =>
        prev.map(c =>
          c.contract_number === contractNumber
            ? { ...c, workflow_status: chosenStatus }
            : c
        )
      );
  
      alert(`✅ Workflow status for ${contractNumber} changed to "${chosenStatus}".`);
    } catch (err) {
      console.error(`❌ Error updating workflow status for ${contractNumber}:`, err);
      alert('❌ Failed to update Workflow Status. See console for details.');
    }
  };

  // Helper to format Firestore timestamp (or plain JS Date) as "DD-MMM-YYYY"
// ─── Revised formatDate helper ──────────────────────────────────
// Converts Firestore Timestamp (or plain object with .seconds) or JS Date/string
// into "DD-MMM-YYYY". Returns '—' if invalid/absent.
// ─── Updated formatDate (handles ts.toDate(), ts.seconds, or ts._seconds) ──────────────────────────
const formatDate = (ts) => {
  if (!ts) return '—';

  let d;

  // A) Firestore Timestamp instance (has toDate()):
  if (typeof ts.toDate === 'function') {
    d = ts.toDate();

  // B) Plain object form from Firestore (could use .seconds or ._seconds):
  } else if (ts.seconds !== undefined) {
    d = new Date(ts.seconds * 1000);
  } else if (ts._seconds !== undefined) {
    d = new Date(ts._seconds * 1000);

  // C) Already a JS‐Date or an ISO‐string:
  } else {
    d = new Date(ts);
  }

  if (isNaN(d.getTime())) {
    return '—';
  }

  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const getContractDate = (ts) => {
  if (!ts) return null;
  // If it's a Firestore Timestamp object with toDate()
  if (typeof ts.toDate === 'function') {
    return ts.toDate();
  }
  // If it's stored as { seconds, nanoseconds }
  if (ts.seconds != null && ts.nanoseconds != null) {
    return new Date(ts.seconds * 1000 + ts.nanoseconds / 1e6);
  }
  // Fallback: try the Date constructor directly
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

// ───────────────────────────────────────────────────────────────────────────────────────────────

  const refreshContractStatus = async (contractNumber) => {
    // show spinner on that row
    setRefreshingContracts(prev => ({ ...prev, [contractNumber]: true }));
  
    try {
      const { data } = await axios.post(
        'http://localhost:5001/api/refresh-contract-status',
        { contractNumber }
      );
  
      // if your API ever returns success: false, bubble it up
      if (!data.success) {
        throw new Error(data.message || 'Unknown error');
      }
  
      const newStatus = data.status; // e.g. "Accepted", "Pending"...
  
      // update the one contract in our state
      setContracts(old =>
        old.map(c =>
          c.contract_number === contractNumber
            ? { ...c, workflow_status: newStatus }
            : c
        )
      );
  
      alert(`🔄 Status updated to "${newStatus}"`);
    } catch (err) {
      console.error(
        '❌ refresh-contract-status failed:',
        err.response?.data ?? err.message
      );
      alert(
        `❌ Failed to refresh contract status:\n${
          err.response?.data?.message || err.message
        }`
      );
    } finally {
      // hide spinner
      setRefreshingContracts(prev => ({ ...prev, [contractNumber]: false }));
    }
  };

  return (
    <div className={styles.dashboardWrapper}>
  {/* ─── Logout button ─────────────────────────────────────────────────── */}
  <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
    <button className={styles.logoutButton} onClick={handleLogout}>
      Logout
    </button>
  </div>

  {/* ─── “Start Auto Processing” button (for super_user or admin) ───────────────── */}
{(user?.role === 'super_user' || user?.role === 'admin') && (
  <div style={{ marginBottom: '1rem' }}>
    <button
      className={styles.button_autoprocess}
      onClick={autoProcessContracts}
      disabled={loadingAuto}
    >
      {loadingAuto ? '⏳ Processing…' : '⚙️ Start Auto Processing'}
    </button>
    {successMessage && (
      <span style={{ marginLeft: '1rem', color: 'green' }}>
        {successMessage}
      </span>
    )}
    {errorAuto && (
      <span style={{ marginLeft: '1rem', color: 'red' }}>
        {errorAuto}
      </span>
    )}
  </div>
)}

  <div className={styles.dashboardTitle}>
    <BarChartBig size={20} /> LOI Auto Check Dashboard
  </div>

      <div className={styles.kpiWrapper}>
        <div className={styles.kpiCard}>
          <h3>✅ Passed</h3>
          <div className={styles.kpiCardValue}>{filteredContracts.length > 0 ? passedCount : 0}</div>
        </div>
        <div className={styles.kpiCard}>
          <h3>❌ Needs Review</h3>
          <div className={styles.kpiCardValue}>{filteredContracts.length > 0 ? reviewCount : 0}</div>
        </div>
      </div>

      {/* ─── Filters + Date‐range + Export button ─────────────────────────────────── */}
<div className={styles.filtersWrapper}>
  <input
    type="text"
    placeholder="Search by Contract Number, Status, or Tenant Type"
    value={filters.search}
    onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
  />
  <select onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}>
    <option value="">Select Status</option>
    <option value="Passed">Passed</option>
    <option value="Needs Review">Needs Review</option>
  </select>
  <select onChange={e => setFilters(prev => ({ ...prev, workflowStatus: e.target.value }))}>
    <option value="">Select Workflow Status</option>
    <option value="Accepted">Accepted</option>
    <option value="In Progress">In Progress</option>
    <option value="Pending">Pending</option>
  </select>
  <select onChange={e => setFilters(prev => ({ ...prev, tenantType: e.target.value }))}>
    <option value="">Select Tenant Type</option>
    <option value="PND - PN Financial Service - ATM">PND - PN Financial Service - ATM</option>
    <option value="Commercial">Commercial</option>
  </select>

  {/* ─── New “From” / “To” date pickers ───────────────────────────────────────── */}
    {/* ─── “From” / “To” date pickers ───────────────────────────────────────────── */}
{/* ─── “From” / “To” date pickers + Export button ─────────────────────────── */}
{/* ─── “From” / “To” date pickers + Export buttons ─────────────────────────── */}
<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
  <label>
    From:&nbsp;
    <input
      type="date"
      value={exportFromRaw}
      onChange={e => setExportFromRaw(e.target.value)}
      style={{ height: '1.5rem' }}
    />
  </label>
  <label>
    To:&nbsp;
    <input
      type="date"
      value={exportToRaw}
      onChange={e => setExportToRaw(e.target.value)}
      style={{ height: '1.5rem' }}
    />
  </label>
  <button
    onClick={handleExport}
    style={{ height: '2rem' }}
  >
    Export to Excel
  </button>
  <button
    onClick={handleTodaysReport}
    style={{ height: '2rem' }}
  >
    Today’s Report
  </button>
</div>
</div>

      <table className={styles.resultTable}>
  <thead>
    <tr>
      <th>Contract</th>
      <th>Timestamp</th>
      <th>Status</th>
      <th>Workflow Status</th>
      <th>Tenant Type</th>
      <th>Lead Status</th>
      <th>Summary</th>
      <th>Simplicity Link</th>
      <th>Force Process</th>
    </tr>
  </thead>
  <tbody>
    {filteredContracts.map((contract, idx) => {
      const status = isValid(contract) ? '✅ Passed' : '❌ Needs Review';
      const rowId = contract.contract_number || `row-${idx}`;

      return (
        <React.Fragment key={rowId}>
          <tr>
            <td>{contract.contract_number || '—'}</td>
            <td>{formatDate(contract.timestamp)}</td>
            <td>{status}</td>
            <td>
              {editingWorkflowFor === contract.contract_number ? (
                <select
                  value={contract.workflow_status || ''}
                  onChange={e => {
                    handleWorkflowStatusChange(contract.contract_number, e.target.value);
                    setEditingWorkflowFor(null);
                  }}
                  onBlur={() => setEditingWorkflowFor(null)}
                  autoFocus
                  className={styles.workflowSelect}
                >
                  <option value="">-- select status --</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Reject">Reject</option>
                  <option value="Pending">Pending Verification</option>
                  <option value="Simplify need editing">Simplify need editing</option>
                  <option value="LOI need editing">LOI need editing</option>
                </select>
              ) : (
                <>
                  {contract.workflow_status || '—'}
                  {refreshingContracts[contract.contract_number] ? (
                    <span className={styles.spinner} />
                  ) : (
                    <button
                      className={styles.refreshIconButton}
                      title="Refresh Status"
                      onClick={() => refreshContractStatus(contract.contract_number)}
                    >
                      <RefreshCcw size={14} />
                    </button>
                  )}
                  <button
                    className={styles.editWorkflowButton}
                    title="Edit Workflow Status"
                    onClick={() => setEditingWorkflowFor(contract.contract_number)}
                  >
                    ✏️
                  </button>
                </>
              )}
            </td>
            <td>{contract.tenant_type || '—'}</td>
            <td>
              <select
                value={leadStatuses[contract.contract_number] || ''}
                onChange={e => handleLeadStatusChange(contract.contract_number, e.target.value)}
                className={styles.leadStatusSelect}
              >
                <option value="">Select Lead Status</option>
                <option value="Acknowledge">Acknowledge</option>
                <option value="In-progress">In-progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </td>
            <td>
              <button
                className={styles.expandButton}
                onClick={() => toggleDetails(rowId)}
              >
                {expandedId === rowId ? 'Hide' : 'View Details'}
              </button>
            </td>
            <td>
              <button
                className={styles.buttonOpenPopup}
                onClick={() =>
                  axios
                    .post('http://localhost:5001/api/open-popup-tab', {
                      systemType: 'simplicity',
                      contractNumber: contract.contract_number.replace(/_/g, '/'),
                    })
                    .then(res =>
                      res.data.success
                        ? alert('✅ Popup opened. Please check Chrome.')
                        : alert('❌ Failed to open popup.')
                    )
                    .catch(err => {
                      alert('❌ Error triggering popup tab.');
                      console.error(err);
                    })
                }
              >
                🧾 Open Contract Popup
              </button>
            </td>
            <td>
              <button
                className={styles.forceProcessButton}
                onClick={() => forceProcessFile(contract.contract_number)}
              >
                🚀 Force Process
              </button>
            </td>
          </tr>

          {expandedId === rowId && (
            <tr>
              <td colSpan={9}>
                <div className={styles.detailsSection}>
                  <h4>🔍 Compare Result</h4>
                  <table className={styles.detailsTable}>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>PDF</th>
                        <th>Web</th>
                        <th>Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(contract.compare_result || []).map((row, i) => (
                        <tr key={i}>
                          <td>{row.field}</td>
                          <td>{row.pdf}</td>
                          <td>{row.web}</td>
                          <td>{row.match ? '✅' : '❌'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h4>🧠 PDF Validation Result</h4>
                  <table className={styles.detailsTable}>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Value</th>
                        <th>Valid</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(contract.validation_result || []).map((row, i) => (
                        <tr key={i}>
                          <td>{row.field}</td>
                          <td>{row.value}</td>
                          <td>{row.valid ? '✅' : '❌'}</td>
                          <td>{row.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h4>🌐 Simplicity Validation Result</h4>
                  <table className={styles.detailsTable}>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Value</th>
                        <th>Valid</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(contract.web_validation_result || []).map((row, i) => (
                        <tr key={i}>
                          <td>{row.field}</td>
                          <td>{row.value}</td>
                          <td>{row.valid ? '✅' : '❌'}</td>
                          <td>{row.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {contract.meter_validation_result && contract.meter_validation_result.length > 0 && (
                    <div style={{ marginTop: '2rem' }}>
                      <h4>🌡 Meter Validation Result</h4>
                      <table className={styles.detailsTable}>
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Value</th>
                            <th>Valid</th>
                            <th>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contract.meter_validation_result.map((row, i) => (
                            <tr key={i}>
                              <td>{row.field}</td>
                              <td>{row.value ?? '—'}</td>
                              <td>{row.valid ? '✅' : '❌'}</td>
                              <td>{row.reason || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    })}
  </tbody>
</table>
    </div>
  );
}

export default LOIDashboard;