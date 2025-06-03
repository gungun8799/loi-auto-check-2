// ===== App.js =====
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import styles from './pages/App.module.css';

import AIVision from './pages/AIVision';
import LOIautocheck from './pages/LOIautocheck';
import APNonTradeInvoiceMatch from './pages/APNonTradeInvoiceMatch'; // New import
import Module2 from './pages/Module_2';
import Module3 from './pages/Module_3';
import Module4 from './pages/Module_4';
import Module5 from './pages/Module_5';
import LOIDashboard from './pages/LOIDashboard';


function SubBar() {
  const location = useLocation();

  if (location.pathname.startsWith('/ai-vision')) {
    return (
      <div className={styles.subbar}>
        <NavLink to="/ai-vision/loi-check" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>LOI Auto Check</NavLink>
        <NavLink to="/ai-vision/loi-dashboard" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>LOI Dashboard</NavLink>
        <NavLink to="/ai-vision/ap-non-trade-invoice-matching" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>AP Non-Trade Invoice Matching</NavLink>
        <NavLink to="/ai-vision/mock-tab-2" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>Mock Tab 2</NavLink>
      </div>
    );
  }

  if (location.pathname.startsWith('/module-2')) {
    return (
      <div className={styles.subbar}>
        <NavLink to="/module-2/chatbot-1" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>Chatbot_1</NavLink>
        <NavLink to="/module-2/chatbot-2" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>Chatbot_2</NavLink>
      </div>
    );
  }

  if (location.pathname.startsWith('/module-3')) {
    return (
      <div className={styles.subbar}>
        <NavLink to="/module-3/ml-1" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>ML_1</NavLink>
        <NavLink to="/module-3/ml-2" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>ML_2</NavLink>
      </div>
    );
  }

  if (location.pathname.startsWith('/module-4')) {
    return (
      <div className={styles.subbar}>
        <NavLink to="/module-4/flow-1" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>Flow_1</NavLink>
      </div>
    );
  }

  if (location.pathname.startsWith('/module-5')) {
    return (
      <div className={styles.subbar}>
        <NavLink to="/module-5/virtual-1" className={({ isActive }) => isActive ? styles.activeSubTab : styles.subTab}>Virtual_1</NavLink>
      </div>
    );
  }

  return null;
}

function App() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <Router>
      <div className={styles.App}>
        <div className={styles.navbar}>
          <img src="./../lotus-logo.png" alt="Lotus Logo" className={styles.logo} />
          <span className={styles.title_2}>Finance & Accounting AI Hub</span>
        </div>

        <div className={styles.container}>
          <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
            <button onClick={toggleSidebar} className={styles.menuButtonSidebar}>
              <Menu size={24} />
            </button>
            <NavLink to="/ai-vision" className={({ isActive }) =>
              window.location.pathname.startsWith('/ai-vision') ? styles.activeTabButton : styles.tabButton
            }>
              {!isCollapsed ? 'AI Vision' : '🧠'}
            </NavLink>
            <NavLink to="/module-2" className={({ isActive }) =>
              window.location.pathname.startsWith('/module-2') ? styles.activeTabButton : styles.tabButton
            }>
              {!isCollapsed ? 'Chatbot' : '📦'}
            </NavLink>
            <NavLink to="/module-3" className={({ isActive }) =>
              window.location.pathname.startsWith('/module-3') ? styles.activeTabButton : styles.tabButton
            }>
              {!isCollapsed ? 'Machine Learning' : '📊'}
            </NavLink>
            <NavLink to="/module-4" className={({ isActive }) =>
              window.location.pathname.startsWith('/module-4') ? styles.activeTabButton : styles.tabButton
            }>
              {!isCollapsed ? 'Flow Generation' : '📝'}
            </NavLink>
            <NavLink to="/module-5" className={({ isActive }) =>
              window.location.pathname.startsWith('/module-5') ? styles.activeTabButton : styles.tabButton
            }>
              {!isCollapsed ? 'Virtual Experts' : '🔧'}
            </NavLink>
          </div>

          <div className={styles.mainContent}>
            <SubBar />
            <Routes>
              <Route path="/ai-vision" element={<AIVision />} />
              <Route path="/ai-vision/loi-check" element={<LOIautocheck />} />
              <Route path="/ai-vision/loi-dashboard" element={<LOIDashboard />} />
              <Route path="/ai-vision/ap-non-trade-invoice-matching" element={<APNonTradeInvoiceMatch />} /> {/* New route */}
              <Route path="/ai-vision/mock-tab-2" element={<div>Mock Tab 2 Content</div>} />

              <Route path="/module-2" element={<Module2 />} />
              <Route path="/module-2/chatbot-1" element={<div>Chatbot 1 Content</div>} />
              <Route path="/module-2/chatbot-2" element={<div>Chatbot 2 Content</div>} />

              <Route path="/module-3" element={<Module3 />} />
              <Route path="/module-3/ml-1" element={<div>ML Tab 1</div>} />
              <Route path="/module-3/ml-2" element={<div>ML Tab 2</div>} />

              <Route path="/module-4" element={<Module4 />} />
              <Route path="/module-4/flow-1" element={<div>Flow Tab 1</div>} />

              <Route path="/module-5" element={<Module5 />} />
              <Route path="/module-5/virtual-1" element={<div>Virtual Expert Tab 1</div>} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;