import React, { useEffect, useState } from 'react';
import axios from 'axios';
import styles from './LOIDashboard.module.css';
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

function LOIDashboard() {
  const [contracts, setContracts] = useState([]);
  const [filteredContracts, setFilteredContracts] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [weekStats, setWeekStats] = useState({});
  const [refreshingContracts, setRefreshingContracts] = useState({});
  const [filters, setFilters] = useState({
    workflowStatus: '',
    tenantType: '',
    status: '',
    search: ''
  });
  const [leadStatuses, setLeadStatuses] = useState({});

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
    const cleanedContracts = filteredContracts.map(contract => {
      const { pdf_extracted, web_extracted, ...rest } = contract;
      return rest;
    });
    const ws = XLSX.utils.json_to_sheet(cleanedContracts);
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

  const refreshContractStatus = async (contractNumber) => {
    setRefreshingContracts(prev => ({ ...prev, [contractNumber]: true }));
    try {
      const res = await axios.post('http://localhost:5001/api/refresh-contract-status', {
        contractNumber
      });
      alert(`🔄 Status: ${res.data.status}`);
    } catch (err) {
      alert('❌ Failed to refresh contract status.');
      console.error(err);
    } finally {
      setRefreshingContracts(prev => ({ ...prev, [contractNumber]: false }));
    }
  };

  return (
    <div className={styles.dashboardWrapper}>
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

      <div className={styles.filtersWrapper}>
        <input type="text" placeholder="Search by Contract Number, Status, or Tenant Type" value={filters.search} onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))} />
        <select onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}>
          <option value="">Select Status</option>
          <option value="Passed">Passed</option>
          <option value="Needs Review">Needs Review</option>
        </select>
        <select onChange={(e) => setFilters(prev => ({ ...prev, workflowStatus: e.target.value }))}>
          <option value="">Select Workflow Status</option>
          <option value="Accepted">Accepted</option>
          <option value="In Progress">In Progress</option>
          <option value="Pending">Pending</option>
        </select>
        <select onChange={(e) => setFilters(prev => ({ ...prev, tenantType: e.target.value }))}>
          <option value="">Select Tenant Type</option>
          <option value="PND - PN Financial Service - ATM">PND - PN Financial Service - ATM</option>
          <option value="Commercial">Commercial</option>
        </select>
        <button onClick={handleExport}>Export to Excel</button>
      </div>

      <table className={styles.resultTable}>
        <thead>
          <tr>
            <th>Contract</th>
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
                  <td>{status}</td>
                  <td>
                    <div className={styles.workflowStatusCell}>
                      {contract.workflow_status || '—'}
                      {refreshingContracts[contract.contract_number] ? (
                        <span className={styles.spinner}></span>
                      ) : (
                        <button
                          className={styles.refreshIconButton}
                          title="Refresh Status"
                          onClick={() => refreshContractStatus(contract.contract_number)}
                        >
                          <RefreshCcw size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td>{contract.tenant_type || '—'}</td>
                  <td>
                    <select value={leadStatuses[contract.contract_number] || ''} onChange={(e) => handleLeadStatusChange(contract.contract_number, e.target.value)} className={styles.leadStatusSelect}>
                      <option value="">Select Lead Status</option>
                      <option value="Acknowledge">Acknowledge</option>
                      <option value="In-progress">In-progress</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </td>
                  <td>{status === '✅ Passed' ? <a href={`https://simplicity.approve/${contract.contract_number}`} target="_blank" rel="noreferrer">Approve</a> : <button className={styles.expandButton} onClick={() => toggleDetails(rowId)}>{expandedId === rowId ? 'Hide' : 'View Issues'}</button>}</td>
                  <td><button className={styles.buttonOpenPopup} onClick={() => axios.post('http://localhost:5001/api/open-popup-tab', { systemType: 'simplicity', contractNumber: contract.contract_number.replace(/_/g, '/') }).then(res => res.data.success ? alert('✅ Popup opened. Please check Chrome.') : alert('❌ Failed to open popup.')).catch(err => { alert('❌ Error triggering popup tab.'); console.error(err); })}>🧾 Open Contract Popup</button></td>
                  <td><button className={styles.forceProcessButton} onClick={() => forceProcessFile(contract.contract_number)}>🚀 Force Process</button></td>
                </tr>
                {expandedId === rowId && (
                <tr>
                  <td colSpan={8}>
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
