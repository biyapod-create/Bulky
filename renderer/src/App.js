import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import Composer from './pages/Composer';
import Templates from './pages/Templates';
import Verify from './pages/Verify';
import SpamChecker from './pages/SpamChecker';
import Settings from './pages/Settings';
import ToastContainer from './components/ToastContainer';
import { ToastProvider } from './components/ToastContext';
import { ThemeProvider } from './components/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router>
          <div className="app-container">
            <TitleBar />
            <div className="main-layout">
              <Sidebar />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/campaigns" element={<Campaigns />} />
                  <Route path="/composer" element={<Composer />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/verify" element={<Verify />} />
                  <Route path="/spam-checker" element={<SpamChecker />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </main>
            </div>
            <ToastContainer />
          </div>
        </Router>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
