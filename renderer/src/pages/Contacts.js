import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Users, Plus, Upload, Download, Trash2, Search, Edit2, Tag, CheckCircle,
  XCircle, AlertTriangle, RefreshCw, ChevronUp, ChevronDown, ChevronLeft,
  ChevronRight, X, Eye, BadgeCheck, ArrowUpDown, MoreHorizontal, Play, Pause, Square,
  FileDown, Loader2
} from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import useLiveDataRefresh from '../hooks/useLiveDataRefresh';

function Contacts({ isActive }) {
  const { addToast } = useToast();
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [detailContact, setDetailContact] = useState(null);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [importData, setImportData] = useState({ contacts: [], listId: '' });
  const [importProgress, setImportProgress] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  // importPreview = { headers: [], rows: [], mapping: {}, totalRows: 0, listId: '' }
  const [contactStats, setContactStats] = useState({ total: 0, verified: 0, bounced: 0, active: 0 });
  const [verifyProgress, setVerifyProgress] = useState(null);
  const [verifyLiveResults, setVerifyLiveResults] = useState([]);
  const [isBulkVerifying, setIsBulkVerifying] = useState(false);
  const [isVerifyPaused, setIsVerifyPaused] = useState(false);
  const [verifyingContactId, setVerifyingContactId] = useState(null);

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    perPage: 25,
    totalPages: 1,
    totalCount: 0
  });

  // Sorting
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('DESC');

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    listId: '',
    status: '',
    verified: '',
    tag: ''
  });

  const [formData, setFormData] = useState({
    email: '', firstName: '', lastName: '', company: '', phone: '',
    customField1: '', customField2: '', listId: '', tags: []
  });

  const [newTag, setNewTag] = useState({ name: '', color: '#5bb4d4' });
  const searchTimeoutRef = useRef(null);
  const verifyResultsRef = useRef([]);
  const bulkVerifyingRef = useRef(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    loadLists();
    loadTags();
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search);
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 350);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [filters.search]);

  const loadLists = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.lists.getAll();
        setLists(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      // ignored
    }
  };

  const loadTags = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.tags.getAll();
        setTags(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      // ignored
    }
  };

  const loadContactStats = async () => {
    try {
      if (window.electron?.contacts?.getStats) {
        const s = await window.electron.contacts.getStats();
        setContactStats(s || { total: 0, verified: 0, bounced: 0, active: 0 });
      }
    } catch (e) {
      // ignored
    }
  };

  const loadContacts = useCallback(async (overrides = {}) => {
    if (!window.electron) return;
    setLoading(true);
    try {
      const nextPage = overrides.page ?? pagination.page;
      const nextPerPage = overrides.perPage ?? pagination.perPage;
      const params = {
        search: debouncedSearch,
        listId: filters.listId,
        status: filters.status,
        verificationStatus: filters.verified || '',
        tag: filters.tag,
        sortBy: sortColumn,
        sortOrder: sortDirection,
        page: nextPage,
        perPage: nextPerPage
      };

      // Try paginated endpoint, fall back to getFiltered
      let result;
      if (window.electron.contacts.getPage) {
        result = await window.electron.contacts.getPage(params);
        const nextContacts = Array.isArray(result?.contacts) ? result.contacts : [];
        setContacts(nextContacts);
        setSelectedContacts(prev => prev.filter(id => nextContacts.some(contact => contact.id === id)));
        setPagination(prev => ({
          ...prev,
          page: nextPage,
          perPage: nextPerPage,
          totalPages: (result && typeof result.totalPages === 'number') ? result.totalPages : 1,
          totalCount:
            (result && typeof result.totalCount === 'number') ? result.totalCount :
            (result && typeof result.total === 'number') ? result.total :
            0
        }));
      } else {
        const filtered = await window.electron.contacts.getFiltered(params);
        const filteredArr = Array.isArray(filtered) ? filtered : [];
        setContacts(filteredArr);
        setSelectedContacts(prev => prev.filter(id => filteredArr.some(contact => contact.id === id)));
        setPagination(prev => ({
          ...prev,
          page: nextPage,
          perPage: nextPerPage,
          totalCount: filteredArr.length,
          totalPages: Math.ceil(filteredArr.length / nextPerPage) || 1
        }));
      }
    } catch (error) {
      console.error('loadContacts error:', error?.message);
      addToast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    addToast,
    debouncedSearch,
    filters.listId,
    filters.status,
    filters.tag,
    filters.verified,
    pagination.page,
    pagination.perPage,
    sortColumn,
    sortDirection
  ]);

  const getListLabel = useCallback((contact) => {
    if (contact.listName) return contact.listName;
    if (!contact.listId) return '';
    return lists.find(list => list.id === contact.listId)?.name || '';
  }, [lists]);

  const applyVerificationResults = useCallback((results) => {
    if (!Array.isArray(results) || results.length === 0) return;

    const byEmail = new Map(
      results
        .filter(result => result?.email)
        .map(result => [String(result.email).toLowerCase(), result])
    );

    setContacts(prev => prev.map(contact => {
      const match = byEmail.get(String(contact.email || '').toLowerCase());
      if (!match) return contact;
      return {
        ...contact,
        verificationStatus: match.status || contact.verificationStatus,
        verificationScore: match.score ?? contact.verificationScore,
        verificationDetails: match.details || contact.verificationDetails
      };
    }));

    setDetailContact(prev => {
      if (!prev?.email) return prev;
      const match = byEmail.get(String(prev.email).toLowerCase());
      if (!match) return prev;
      return {
        ...prev,
        verificationStatus: match.status || prev.verificationStatus,
        verificationScore: match.score ?? prev.verificationScore,
        verificationDetails: match.details || prev.verificationDetails
      };
    });
  }, []);

  const startBulkVerification = useCallback((total) => {
    bulkVerifyingRef.current = true;
    verifyResultsRef.current = [];
    setVerifyLiveResults([]);
    setVerifyProgress({ current: 0, total });
    setIsBulkVerifying(true);
    setIsVerifyPaused(false);
  }, []);

  const finishBulkVerification = useCallback(() => {
    bulkVerifyingRef.current = false;
    setIsBulkVerifying(false);
    setIsVerifyPaused(false);
  }, []);

  const refreshContactsSurface = useCallback(async () => {
    await Promise.all([
      loadContacts(),
      loadContactStats(),
      loadLists(),
      loadTags()
    ]);
  }, [loadContacts]);

  // React to background data changes (bulk imports, tag mutations, etc.)
  useLiveDataRefresh({
    load: refreshContactsSurface,
    isActive,
    dataTypes: ['contacts'],
    pollMs: 30000
  });

  // 30-second polling fallback — guards against missed IPC events when
  // the window loses focus during a large CSV import.

  useEffect(() => {
    let cleanup;
    if (window.electron?.verify?.onProgress) {
      cleanup = window.electron.verify.onProgress((data) => {
        if (!bulkVerifyingRef.current) return;
        setVerifyProgress(data);
        if (data.email && data.status) {
          const entry = { email: data.email, status: data.status };
          verifyResultsRef.current = [entry, ...verifyResultsRef.current].slice(0, 20);
          setVerifyLiveResults([...verifyResultsRef.current]);
        }
        if (data.paused !== undefined) {
          setIsVerifyPaused(!!data.paused);
        }
      });
    }

    return () => {
      if (cleanup) cleanup();
      else if (window.electron?.verify?.removeProgressListener) {
        window.electron.verify.removeProgressListener();
      }
    };
  }, []);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortColumn(column);
      setSortDirection('ASC');
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const getSortIcon = (column) => {
    if (sortColumn !== column) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
    return sortDirection === 'ASC'
      ? <ChevronUp size={12} style={{ color: 'var(--accent)' }} />
      : <ChevronDown size={12} style={{ color: 'var(--accent)' }} />;
  };

  const handleOpenModal = (contact = null) => {
    if (contact) {
      setEditingContact(contact);
      setFormData({
        email: contact.email,
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        company: contact.company || '',
        phone: contact.phone || '',
        customField1: contact.customField1 || '',
        customField2: contact.customField2 || '',
        listId: contact.listId || '',
        tags: contact.tags ? (typeof contact.tags === 'string' ? JSON.parse(contact.tags) : contact.tags) : []
      });
    } else {
      setEditingContact(null);
      setFormData({ email: '', firstName: '', lastName: '', company: '', phone: '', customField1: '', customField2: '', listId: '', tags: [] });
    }
    setShowModal(true);
  };

  const handleViewDetail = async (contact) => {
    setDetailContact(contact);
    setShowDetailModal(true);
    try {
      // placeholder for detail logic
    } catch (e) {
      // ignored
    }
  };

  const handleSave = async () => {
    if (!formData.email) {
      addToast('Email is required', 'error');
      return;
    }

    try {
      if (editingContact) {
        await window.electron.contacts.update({ ...formData, id: editingContact.id, tags: formData.tags });
        addToast('Contact updated', 'success');
        setShowModal(false);
        await loadContacts();
      } else {
        const result = await window.electron.contacts.add({ ...formData, tags: formData.tags });
        if (!result.success) {
          addToast(result.error || 'Failed to add contact', 'error');
          return;
        }
        addToast('Contact added', 'success');
        setShowModal(false);
        setPagination(prev => ({ ...prev, page: 1 }));
        await loadContacts({ page: 1 });
      }
      await loadContactStats();
    } catch (error) {
      addToast('Failed to save contact', 'error');
    }
  };

  const handleImport = async () => {
    try {
      // Use raw import to get headers + rows for column mapping preview
      const importFn = window.electron.contacts.importRaw || window.electron.contacts.import;
      const result = await importFn();
      if (result.canceled) return;

      if (result.success && result.headers && result.rows?.length > 0) {
        // New flow: show column mapping preview
        setImportPreview({
          headers: result.headers,
          rows: result.rows,
          mapping: result.autoMapping || {},
          totalRows: result.totalRows || result.rows.length,
          listId: ''
        });
      } else if (result.success && result.contacts?.length > 0) {
        // Fallback: old flow without column mapping
        setImportData({ contacts: result.contacts, listId: '' });
        setShowImportModal(true);
      } else if (result.error) {
        addToast(result.error, 'error');
      } else {
        addToast('No contacts found in file', 'error');
      }
    } catch (error) {
      addToast('Import failed: ' + error.message, 'error');
    }
  };

  const handleMappingChange = (header, value) => {
    setImportPreview(prev => {
      if (!prev) return prev;
      const newMapping = { ...prev.mapping };
      // If this field is already mapped to another header, clear that one
      if (value !== 'skip') {
        for (const key of Object.keys(newMapping)) {
          if (newMapping[key] === value && key !== header) {
            newMapping[key] = 'skip';
          }
        }
      }
      newMapping[header] = value;
      return { ...prev, mapping: newMapping };
    });
  };

  const confirmMappedImport = async () => {
    if (!importPreview) return;
    const { rows, mapping, listId } = importPreview;

    // Validate: email column must be mapped
    const emailHeader = Object.keys(mapping).find(k => mapping[k] === 'email');
    if (!emailHeader) {
      addToast('You must map at least one column to Email', 'error');
      return;
    }

    // Build contacts from raw rows using the mapping
    const contacts = [];
    for (const row of rows) {
      const email = (row[emailHeader] || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) continue;

      const contact = { email, firstName: '', lastName: '', company: '', phone: '' };
      for (const [header, field] of Object.entries(mapping)) {
        if (field === 'skip' || field === 'email' || !row[header]) continue;
        contact[field] = (row[header] || '').trim();
      }
      contacts.push(contact);
    }

    if (contacts.length === 0) {
      addToast('No valid email addresses found with current mapping', 'error');
      return;
    }

    // Pass to the existing import confirmation flow
    setImportData({ contacts, listId: listId || '' });
    setImportPreview(null);
    setShowImportModal(true);
  };

  const confirmImport = async () => {
    if (importData.contacts.length === 0) {
      addToast('No valid contacts to import', 'error');
      return;
    }

    setImportProgress({ current: 0, total: importData.contacts.length });

    try {
      const toImport = importData.contacts.map(c => ({ ...c, listId: importData.listId || null }));
      setImportProgress({ current: 0, total: toImport.length });

      const result = await window.electron.contacts.addBulk(toImport);
      const details = [];
      if (result?.duplicates) details.push(`${result.duplicates} duplicates`);
      if (result?.invalid) details.push(`${result.invalid} invalid`);
      addToast(`Imported ${result?.inserted || 0} contacts` + (details.length ? ` (${details.join(', ')})` : ''), 'success');

      setShowImportModal(false);
      setImportProgress(null);
      loadContacts();
      loadContactStats();
    } catch (error) {
      addToast('Import failed: ' + (error.message || 'Unknown error'), 'error');
      setImportProgress(null);
    }
  };

  const handleDelete = async () => {
    if (selectedContacts.length === 0) return;
    if (!window.confirm(`Delete ${selectedContacts.length} contact(s)?`)) return;

    const idsToDelete = [...selectedContacts];
    const remainingContacts = contacts.filter(contact => !idsToDelete.includes(contact.id));
    const fallbackPage = remainingContacts.length === 0 && pagination.page > 1
      ? pagination.page - 1
      : pagination.page;

    setContacts(remainingContacts);
    setSelectedContacts([]);
    setPagination(prev => {
      const totalCount = Math.max((prev.totalCount || 0) - idsToDelete.length, 0);
      return {
        ...prev,
        page: fallbackPage,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / prev.perPage))
      };
    });

    try {
      await window.electron.contacts.delete(idsToDelete);
      addToast(`Deleted ${idsToDelete.length} contacts`, 'success');
      await loadContacts({ page: fallbackPage });
      await loadContactStats();
    } catch (error) {
      await loadContacts();
      addToast('Delete failed', 'error');
    }
  };

  const handleExport = async () => {
    try {
      const toExport = selectedContacts.length > 0
        ? contacts.filter(c => selectedContacts.includes(c.id))
        : contacts;
      const result = await window.electron.export.contacts(toExport);
      if (result.success) {
        addToast(`Exported ${toExport.length} contacts`, 'success');
      }
    } catch (error) {
      addToast('Export failed', 'error');
    }
  };

  const handleBulkVerify = async () => {
    if (selectedContacts.length === 0) {
      addToast('Select contacts to verify', 'error');
      return;
    }

    const selectedEmailSet = new Set(selectedContacts);
    const emails = Array.from(new Set(
      contacts
        .filter(contact => selectedEmailSet.has(contact.id))
        .map(contact => contact.email)
        .filter(Boolean)
    ));

    if (emails.length === 0) {
      addToast('Selected contacts are not available on the current page', 'error');
      return;
    }

    try {
      startBulkVerification(emails.length);
      addToast(`Verifying ${emails.length} contacts...`, 'info');
      const result = await window.electron.verify.bulk(emails);
      if (result?.error) {
        addToast(result.error, 'error');
        return;
      }
      applyVerificationResults(result?.results || []);
      addToast(`Verified ${emails.length} contacts`, 'success');
      await loadContacts();
      await loadContactStats();
    } catch (error) {
      addToast('Verification failed', 'error');
    } finally {
      finishBulkVerification();
    }
  };

  const handleVerifyContact = async (contact) => {
    if (!contact?.email || verifyingContactId) return;

    setVerifyingContactId(contact.id);
    try {
      const result = await window.electron.verify.email(contact.email);
      if (result?.error) {
        addToast(result.error, 'error');
        return;
      }

      applyVerificationResults([result]);
      addToast(`${contact.email} is ${result.status}`, result.status === 'invalid' ? 'warning' : 'success');
      await loadContacts();
      await loadContactStats();
    } catch (error) {
      addToast('Verification failed', 'error');
    } finally {
      setVerifyingContactId(null);
    }
  };

  const handlePauseVerify = async () => {
    try {
      await window.electron.verify.pause();
      setIsVerifyPaused(true);
      addToast('Verification paused', 'info');
    } catch (error) {
      addToast('Unable to pause verification', 'error');
    }
  };

  const handleResumeVerify = async () => {
    try {
      await window.electron.verify.resume();
      setIsVerifyPaused(false);
      addToast('Verification resumed', 'success');
    } catch (error) {
      addToast('Unable to resume verification', 'error');
    }
  };

  const handleStopVerify = async () => {
    try {
      await window.electron.verify.stop();
      addToast('Verification stopped', 'warning');
    } catch (error) {
      addToast('Unable to stop verification', 'error');
    }
  };

  const handleBulkTag = async (tagId) => {
    if (selectedContacts.length === 0) return;
    try {
      if (window.electron.contacts.addTagBulk) {
        await window.electron.contacts.addTagBulk(selectedContacts, tagId);
        addToast(`Tagged ${selectedContacts.length} contacts`, 'success');
        loadContacts();
      }
    } catch (error) {
      addToast('Tagging failed', 'error');
    }
    setShowBulkTagModal(false);
  };

  const handleAddTag = async () => {
    if (!newTag.name.trim()) return;
    try {
      const result = await window.electron.tags.add(newTag);
      if (result && typeof result === 'string') {
        addToast('Tag created', 'success');
        setNewTag({ name: '', color: '#5bb4d4' });
        loadTags();
      } else if (result && result.error) {
        addToast(result.error || 'Failed to create tag', 'error');
      } else {
        addToast('Tag created', 'success');
        setNewTag({ name: '', color: '#5bb4d4' });
        loadTags();
      }
    } catch (error) {
      addToast('Failed to create tag', 'error');
    }
  };

  const toggleSelectAll = () => {
    if (selectedContacts.length === contacts.length && contacts.length > 0) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map(c => c.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedContacts(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getVerificationBadge = (contact) => {
    const vs = contact.verificationStatus;
    if (vs === 'valid') {
      return (
        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle size={11} /> Valid
        </span>
      );
    }
    if (vs === 'risky') {
      return (
        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <AlertTriangle size={11} /> Risky
        </span>
      );
    }
    if (vs === 'invalid') {
      return (
        <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <XCircle size={11} /> Invalid
        </span>
      );
    }
    return (
      <span className="badge badge-default" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <MoreHorizontal size={11} /> Unverified
      </span>
    );
  };

  const getEngagementColor = (score) => {
    if (score >= 70) return 'var(--success)';
    if (score >= 40) return 'var(--warning)';
    if (score > 0) return 'var(--error)';
    return 'var(--border)';
  };

  // Display name helper
  const getDisplayName = (contact) => {
    const isTimestamp = (val) => val && typeof val === 'string' && (val.includes('T') && val.includes(':'));
    const firstName = isTimestamp(contact.firstName) ? '' : (contact.firstName || '');
    const lastName = isTimestamp(contact.lastName) ? '' : (contact.lastName || '');
    return [firstName, lastName].filter(Boolean).join(' ');
  };

  const resetFilters = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setFilters({ search: '', listId: '', status: '', verified: '', tag: '' });
    setDebouncedSearch(''); // flush immediately — don't wait for the 350ms debounce
    setSortColumn('createdAt');
    setSortDirection('DESC');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Drag-and-drop import
  const selectedPageContacts = contacts.filter(contact => selectedContacts.includes(contact.id));
  const selectedVerificationBreakdown = selectedPageContacts.reduce((summary, contact) => {
    const status = String(contact.verificationStatus || 'unverified').toLowerCase();
    if (status === 'valid') summary.valid += 1;
    else if (status === 'risky') summary.risky += 1;
    else if (status === 'invalid') summary.invalid += 1;
    else summary.unverified += 1;
    return summary;
  }, { valid: 0, risky: 0, invalid: 0, unverified: 0 });
  const classifiedCount = Number(contactStats.verified || 0) + Number(contactStats.risky || 0) + Number(contactStats.invalid || 0);
  const verificationCoverage = Number(contactStats.total || 0) > 0
    ? Math.round((classifiedCount / Number(contactStats.total || 1)) * 100)
    : 0;
  const activeFilterCount = [
    debouncedSearch,
    filters.listId,
    filters.status,
    filters.verified,
    filters.tag
  ].filter(Boolean).length;

  const [isDragging, setIsDragging] = useState(false);
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const file = files.find(f => /\.(csv|xlsx?|json|txt)$/i.test(f.name));
    if (!file) { addToast('Please drop a CSV, Excel, JSON, or TXT file', 'error'); return; }
    // In Electron, dropped files have a `path` property — use importRaw with that path
    if (file.path && window.electron?.contacts?.importRaw) {
      try {
        // Pass the path directly via a custom IPC if available; otherwise fall back to dialog
        const result = window.electron.contacts.importFromPath
          ? await window.electron.contacts.importFromPath(file.path)
          : await window.electron.contacts.importRaw();
        if (result && !result.canceled) {
          if (result.success && result.headers && result.rows?.length > 0) {
            setImportPreview({ headers: result.headers, rows: result.rows, mapping: result.autoMapping || {}, totalRows: result.totalRows || result.rows.length, listId: '' });
          } else if (result.error) {
            addToast(result.error, 'error');
          }
        }
      } catch (error) {
        addToast('Import failed: ' + error.message, 'error');
      }
    } else {
      // Fallback: open the import dialog
      await handleImport();
    }
  };

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} style={{ position: 'relative' }}>
      {/* Drop zone overlay */}
      {isDragging && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(91,180,212,0.1)',
          border: '3px dashed var(--accent)', borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
        }}>
          <div style={{ textAlign: 'center', color: 'var(--accent)' }}>
            <Download size={48} style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: '18px', fontWeight: 600 }}>Drop file to import contacts</p>
            <p style={{ fontSize: '13px', opacity: 0.7 }}>CSV, Excel, JSON, or TXT</p>
          </div>
        </div>
      )}

      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Manage your email contacts and lists.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={handleImport} title="Import contacts from CSV, TXT, Excel, JSON, PDF, Word">
            <Download size={16} /> Import
          </button>
          <span className="text-xs text-muted" style={{ alignSelf: 'center', marginLeft: '-8px', marginRight: '8px' }}>CSV, XLSX, JSON, PDF</span>
          <button className="btn btn-outline" onClick={handleExport} title="Export contacts to CSV">
            <Upload size={16} /> Export
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}><Plus size={16} /> Add Contact</button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card" style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(91,180,212,0.1), rgba(91,180,212,0.03))' }}>
          <div className="stat-content" style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '22px', color: 'var(--accent)' }}>{(contactStats.total || 0).toLocaleString()}</div>
            <div className="stat-label">Total</div>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.03))' }}>
          <div className="stat-content" style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '22px', color: 'var(--success)' }}>{(contactStats.verified || 0).toLocaleString()}</div>
            <div className="stat-label">Valid</div>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.03))' }}>
          <div className="stat-content" style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '22px', color: 'var(--warning)' }}>{(contactStats.risky || 0).toLocaleString()}</div>
            <div className="stat-label">Risky</div>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.03))' }}>
          <div className="stat-content" style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '22px', color: 'var(--error)' }}>{(contactStats.invalid || 0).toLocaleString()}</div>
            <div className="stat-label">Invalid</div>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(107,114,128,0.1), rgba(107,114,128,0.03))' }}>
          <div className="stat-content" style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '22px', color: 'var(--text-muted)' }}>{(contactStats.unverified || 0).toLocaleString()}</div>
            <div className="stat-label">Unverified</div>
          </div>
        </div>
      </div>

      <div className="panel-grid mb-4">
        <div className="insight-card">
          <div className="insight-value">{contacts.length}</div>
          <div className="insight-label">Visible On This Page</div>
          <div className="insight-meta">
            Page {pagination.page} of {Math.max(pagination.totalPages || 1, 1)} with {(pagination.totalCount || 0).toLocaleString()} matching contacts
          </div>
        </div>
        <div className="insight-card">
          <div className="insight-value">{verificationCoverage}%</div>
          <div className="insight-label">Verification Coverage</div>
          <div className="insight-meta">
            {classifiedCount.toLocaleString()} contacts already classified into valid, risky, or invalid states
          </div>
          <div className="meter">
            <div
              className="meter-fill"
              style={{
                width: `${verificationCoverage}%`,
                background: verificationCoverage >= 75 ? 'var(--success)' : verificationCoverage >= 40 ? 'var(--warning)' : 'var(--error)'
              }}
            />
          </div>
        </div>
        <div className="insight-card">
          <div className="insight-value">{selectedContacts.length}</div>
          <div className="insight-label">Selection Ready</div>
          <div className="insight-meta">
            {selectedContacts.length > 0
              ? `${selectedVerificationBreakdown.valid} valid, ${selectedVerificationBreakdown.risky} risky, ${selectedVerificationBreakdown.invalid} invalid, ${selectedVerificationBreakdown.unverified} unverified on this page`
              : 'Select contacts to unlock bulk verify, export, tag, and delete actions'}
          </div>
        </div>
        <div className="insight-card">
          <div className="insight-value">{activeFilterCount}</div>
          <div className="insight-label">Active Filters</div>
          <div className="insight-meta">
            {activeFilterCount > 0
              ? 'Filters are actively narrowing the visible contact set'
              : 'No filters applied; you are viewing the broadest contact surface'}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="toolbar-search">
            <Search size={18} />
            <input
              type="text"
              className="form-input"
              placeholder="Search contacts..."
              style={{ paddingLeft: '40px' }}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>

          <select className="form-select" style={{ width: '150px' }} value={filters.listId} onChange={(e) => { setFilters({ ...filters, listId: e.target.value }); setPagination(p => ({ ...p, page: 1 })); }}>
            <option value="">All Lists</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <select className="form-select" style={{ width: '130px' }} value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPagination(p => ({ ...p, page: 1 })); }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="bounced">Bounced</option>
          </select>

          <select className="form-select" style={{ width: '140px' }} value={filters.verified} onChange={(e) => { setFilters({ ...filters, verified: e.target.value }); setPagination(p => ({ ...p, page: 1 })); }}>
            <option value="">Verification</option>
            <option value="valid">Valid</option>
            <option value="risky">Risky</option>
            <option value="invalid">Invalid</option>
            <option value="unverified">Unverified</option>
          </select>

          {tags.length > 0 && (
            <select className="form-select" style={{ width: '120px' }} value={filters.tag} onChange={(e) => { setFilters({ ...filters, tag: e.target.value }); setPagination(p => ({ ...p, page: 1 })); }}>
              <option value="">All Tags</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

          <button className="btn btn-outline btn-sm" onClick={resetFilters}>
            <RefreshCw size={14} /> Reset
          </button>

          <button className="btn btn-outline btn-sm" onClick={() => refreshContactsSurface()}>
            <RefreshCw size={14} /> Refresh
          </button>

          <button className="btn btn-outline btn-sm" onClick={() => setShowTagModal(true)}>
            <Tag size={14} /> Tags
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedContacts.length > 0 && (
        <div className="card mb-4" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
          <div className="flex justify-between items-center" style={{ gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 500 }}>{selectedContacts.length} contact(s) selected</div>
              <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
                {selectedVerificationBreakdown.valid} valid, {selectedVerificationBreakdown.risky} risky, {selectedVerificationBreakdown.invalid} invalid, {selectedVerificationBreakdown.unverified} unverified on this page
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                <Trash2 size={14} /> Delete
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleExport}>
                <FileDown size={14} /> Export
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowBulkTagModal(true)}>
                <Tag size={14} /> Tag
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleBulkVerify} disabled={isBulkVerifying}>
                {isBulkVerifying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                {isBulkVerifying ? ' Verifying...' : ' Verify'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedContacts([])}>
                <X size={14} /> Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {(isBulkVerifying || verifyProgress || verifyLiveResults.length > 0) && (
        <div className="card mb-4" style={{ borderColor: 'var(--accent)', background: isBulkVerifying ? 'var(--accent-dim)' : 'var(--bg-secondary)' }}>
          <div className="flex justify-between items-start" style={{ gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div className="flex items-center gap-2 mb-2">
                <BadgeCheck size={16} style={{ color: 'var(--accent)' }} />
                <strong>Verification Progress</strong>
                {isVerifyPaused && <span className="badge badge-warning">Paused</span>}
                {!isBulkVerifying && verifyProgress && <span className="badge badge-success">Last run complete</span>}
              </div>
              <div className="progress-bar" style={{ marginBottom: '8px' }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${verifyProgress ? Math.round(((verifyProgress.current || 0) / Math.max(verifyProgress.total || 1, 1)) * 100) : 0}%`,
                    background: isVerifyPaused ? 'var(--warning)' : undefined
                  }}
                />
              </div>
              <div className="flex justify-between text-sm text-muted">
                <span>{verifyProgress ? `${verifyProgress.current || 0} of ${verifyProgress.total || 0} checked` : 'Ready for verification'}</span>
                <span>{verifyProgress ? `${Math.round(((verifyProgress.current || 0) / Math.max(verifyProgress.total || 1, 1)) * 100)}%` : '0%'}</span>
              </div>
              {verifyProgress?.email && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Checking <strong style={{ color: 'var(--text)' }}>{verifyProgress.email}</strong>
                </div>
              )}
            </div>

            {isBulkVerifying && (
              <div className="flex gap-2">
                {!isVerifyPaused ? (
                  <button className="btn btn-outline btn-sm" onClick={handlePauseVerify}>
                    <Pause size={14} /> Pause
                  </button>
                ) : (
                  <button className="btn btn-outline btn-sm" onClick={handleResumeVerify}>
                    <Play size={14} /> Resume
                  </button>
                )}
                <button className="btn btn-danger btn-sm" onClick={handleStopVerify}>
                  <Square size={14} /> Stop
                </button>
              </div>
            )}
          </div>

          {verifyLiveResults.length > 0 && (
            <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Live Results</div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {verifyLiveResults.slice(0, 8).map((result, index) => (
                  <div
                    key={`${result.email}-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      fontSize: '12px'
                    }}
                  >
                    {result.status === 'valid' ? <CheckCircle size={12} style={{ color: 'var(--success)' }} /> :
                      result.status === 'invalid' ? <XCircle size={12} style={{ color: 'var(--error)' }} /> :
                        <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.email}</span>
                    <span className={`badge badge-${result.status === 'valid' ? 'success' : result.status === 'invalid' ? 'error' : 'warning'}`}>
                      {result.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contacts Table */}
      <div className="card">
        {loading ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
            <p>Loading contacts...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <h3 className="empty-state-title">No contacts found</h3>
            <p className="empty-state-text">Import contacts or add them manually.</p>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}><Plus size={16} /> Add Contact</button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedContacts.length === contacts.length && contacts.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th onClick={() => handleSort('email')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span className="flex items-center gap-1">Email {getSortIcon('email')}</span>
                  </th>
                  <th onClick={() => handleSort('firstName')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span className="flex items-center gap-1">Name {getSortIcon('firstName')}</span>
                  </th>
                  <th>Company</th>
                  <th>List</th>
                  <th>Status</th>
                  <th onClick={() => handleSort('engagementScore')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <span className="flex items-center gap-1">Engagement {getSortIcon('engagementScore')}</span>
                  </th>
                  <th style={{ width: '80px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(contact => {
                  const displayName = getDisplayName(contact);
                  const engScore = contact.engagementScore || 0;

                  return (
                    <tr key={contact.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedContacts.includes(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                        />
                      </td>
                      <td>
                        <strong
                          style={{ cursor: 'pointer', color: 'var(--accent)' }}
                          onClick={() => handleViewDetail(contact)}
                        >
                          {contact.email}
                        </strong>
                      </td>
                      <td>{displayName || <span className="text-muted">-</span>}</td>
                      <td>{contact.company || '-'}</td>
                      <td>{getListLabel(contact) || <span className="text-muted">No list</span>}</td>
                      <td>{getVerificationBadge(contact)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div style={{
                            width: '50px',
                            height: '6px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '3px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${Math.min(engScore, 100)}%`,
                              height: '100%',
                              background: getEngagementColor(engScore),
                              borderRadius: '3px',
                              transition: 'width 0.3s'
                            }} />
                          </div>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: getEngagementColor(engScore),
                            minWidth: '24px'
                          }}>
                            {engScore}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-outline btn-icon btn-sm"
                            onClick={() => handleVerifyContact(contact)}
                            title="Verify"
                            disabled={isBulkVerifying || verifyingContactId === contact.id}
                          >
                            {verifyingContactId === contact.id ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                          </button>
                          <button
                            className="btn btn-outline btn-icon btn-sm"
                            onClick={() => handleViewDetail(contact)}
                            title="View"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="btn btn-outline btn-icon btn-sm"
                            onClick={() => handleOpenModal(contact)}
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex justify-between items-center mt-4" style={{ padding: '0 4px' }}>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">
              Showing {contacts.length > 0 ? ((pagination.page - 1) * pagination.perPage + 1) : 0}-{Math.min(pagination.page * pagination.perPage, pagination.totalCount)} of {(pagination.totalCount || 0).toLocaleString()} contacts
            </span>
            <select
              className="form-select"
              style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }}
              value={pagination.perPage}
              onChange={(e) => setPagination(prev => ({ ...prev, perPage: parseInt(e.target.value), page: 1 }))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm text-muted">per page</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn btn-outline btn-sm"
              disabled={pagination.page <= 1}
              onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
              title="First page"
            >
              <ChevronLeft size={14} /><ChevronLeft size={14} style={{ marginLeft: '-8px' }} />
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={pagination.page <= 1}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm" style={{ padding: '0 8px', fontWeight: 500 }}>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              className="btn btn-outline btn-sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            >
              <ChevronRight size={14} />
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.totalPages }))}
              title="Last page"
            >
              <ChevronRight size={14} /><ChevronRight size={14} style={{ marginLeft: '-8px' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Contact Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingContact ? 'Edit Contact' : 'Add Contact'}
        footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>Save</button></>}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input type="email" className="form-input" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">List</label>
            <select className="form-select" value={formData.listId} onChange={(e) => setFormData({ ...formData, listId: e.target.value })}>
              <option value="">No List</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input type="text" className="form-input" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input type="text" className="form-input" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Company</label>
            <input type="text" className="form-input" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input type="text" className="form-input" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Custom Field 1</label>
            <input type="text" className="form-input" value={formData.customField1} onChange={(e) => setFormData({ ...formData, customField1: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Custom Field 2</label>
            <input type="text" className="form-input" value={formData.customField2} onChange={(e) => setFormData({ ...formData, customField2: e.target.value })} />
          </div>
        </div>

        {/* Tag selector */}
        {tags.length > 0 && (
          <div className="form-group">
            <label className="form-label">Tags</label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => {
                const isSelected = formData.tags.includes(tag.id);
                return (
                  <span
                    key={tag.id}
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        tags: isSelected ? prev.tags.filter(t => t !== tag.id) : [...prev.tags, tag.id]
                      }));
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      background: isSelected ? tag.color + '30' : 'var(--bg-tertiary)',
                      color: isSelected ? tag.color : 'var(--text-muted)',
                      border: `1px solid ${isSelected ? tag.color : 'var(--border)'}`,
                      transition: 'all 0.15s'
                    }}
                  >
                    {tag.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Import Column Mapping Preview Modal */}
      <Modal isOpen={!!importPreview} onClose={() => setImportPreview(null)} title="Map Columns" size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setImportPreview(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={confirmMappedImport}
            disabled={!importPreview || !Object.values(importPreview.mapping || {}).includes('email')}>
            Confirm Import
          </button>
        </>}>
        {importPreview && (() => {
          const mappingOptions = [
            { value: 'email', label: 'Email *' },
            { value: 'firstName', label: 'First Name' },
            { value: 'lastName', label: 'Last Name' },
            { value: 'company', label: 'Company' },
            { value: 'phone', label: 'Phone' },
            { value: 'status', label: 'Status' },
            { value: 'skip', label: 'Skip' }
          ];
          const { headers, rows, mapping, totalRows } = importPreview;
          const emailMapped = Object.values(mapping).includes('email');
          const validEmailCount = emailMapped
            ? rows.filter(r => {
                const emailHeader = Object.keys(mapping).find(k => mapping[k] === 'email');
                return emailHeader && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((r[emailHeader] || '').trim());
              }).length
            : 0;

          return (
            <div>
              <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {totalRows.toLocaleString()} rows found
                  {emailMapped && <span style={{ color: 'var(--success)', marginLeft: '8px' }}>
                    ({validEmailCount.toLocaleString()} valid emails)
                  </span>}
                </p>
                <p className="text-sm text-muted" style={{ margin: '6px 0 0 0' }}>
                  Map each column to a contact field. Columns mapped to "Skip" will be ignored.
                </p>
              </div>

              {!emailMapped && (
                <div style={{
                  padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--error)',
                  borderRadius: '8px', marginBottom: '16px', color: 'var(--error)', fontSize: '13px'
                }}>
                  <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Please map at least one column to <strong>Email</strong> to continue.
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Add to List (optional)</label>
                <select className="form-select" value={importPreview.listId}
                  onChange={(e) => setImportPreview(prev => ({ ...prev, listId: e.target.value }))}>
                  <option value="">No List</option>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div className="table-container" style={{ maxHeight: '340px', overflow: 'auto' }}>
                <table className="table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} style={{ minWidth: '140px', padding: '8px' }}>
                          <div style={{ marginBottom: '6px', fontWeight: 600, color: 'var(--text)' }}>{h}</div>
                          <select
                            className="form-select"
                            style={{
                              fontSize: '12px', padding: '4px 8px', width: '100%',
                              background: mapping[h] === 'email' ? 'rgba(91,180,212,0.15)' : 'var(--bg-secondary)',
                              borderColor: mapping[h] === 'email' ? 'var(--accent)' : 'var(--border)',
                              color: 'var(--text)'
                            }}
                            value={mapping[h] || 'skip'}
                            onChange={(e) => handleMappingChange(h, e.target.value)}
                          >
                            {mappingOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {headers.map((h, ci) => (
                          <td key={ci} style={{
                            padding: '6px 8px', maxWidth: '200px', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            color: mapping[h] === 'skip' ? 'var(--text-muted)' : 'var(--text)',
                            opacity: mapping[h] === 'skip' ? 0.5 : 1
                          }}>
                            {row[h] || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalRows > 5 && (
                <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: '8px' }}>
                  Showing 5 of {totalRows.toLocaleString()} rows
                </p>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImportModal} onClose={() => { setShowImportModal(false); setImportProgress(null); }} title="Import Contacts" size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowImportModal(false); setImportProgress(null); }}>Cancel</button><button className="btn btn-primary" onClick={confirmImport} disabled={!!importProgress}>
          {importProgress ? `Importing... ${importProgress.current}/${importProgress.total}` : `Import ${importData.contacts.length} Contacts`}
        </button></>}>
        <div className="mb-4" style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
          <p style={{ margin: 0 }}><strong><CheckCircle size={14} style={{ color: 'var(--success)', marginRight: '6px' }} />Found {importData.contacts.length} valid email addresses</strong></p>
          <p className="text-sm text-muted" style={{ margin: '8px 0 0 0' }}>Review the data below before importing. Names and company info are automatically detected from column headers.</p>
        </div>

        {importProgress && (
          <div className="mb-4">
            <div className="progress-bar" style={{ height: '8px' }}>
              <div className="progress-fill" style={{
                width: `${(importProgress.current / importProgress.total) * 100}%`,
                transition: 'width 0.3s'
              }} />
            </div>
            <p className="text-sm text-muted mt-2" style={{ textAlign: 'center' }}>
              Importing {importProgress.current} of {importProgress.total}...
            </p>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Add to List (optional)</label>
          <select className="form-select" value={importData.listId} onChange={(e) => setImportData({ ...importData, listId: e.target.value })}>
            <option value="">No List</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="table-container" style={{ maxHeight: '300px', overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Email</th><th>First Name</th><th>Last Name</th><th>Company</th></tr></thead>
            <tbody>
              {importData.contacts.slice(0, 100).map((c, i) => (
                <tr key={i}><td>{c.email}</td><td>{c.firstName || '-'}</td><td>{c.lastName || '-'}</td><td>{c.company || '-'}</td></tr>
              ))}
            </tbody>
          </table>
          {importData.contacts.length > 100 && <p className="text-muted text-center mt-2">...and {importData.contacts.length - 100} more</p>}
        </div>
      </Modal>

      {/* Tag Management Modal */}
      <Modal isOpen={showTagModal} onClose={() => setShowTagModal(false)} title="Manage Tags"
        footer={<button className="btn btn-secondary" onClick={() => setShowTagModal(false)}>Close</button>}>
        <div className="flex gap-2 mb-4">
          <input type="text" className="form-input" placeholder="New tag name" value={newTag.name} onChange={(e) => setNewTag({ ...newTag, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleAddTag()} />
          <input type="color" value={newTag.color} onChange={(e) => setNewTag({ ...newTag, color: e.target.value })} style={{ width: '50px', height: '40px', border: 'none', cursor: 'pointer' }} />
          <button className="btn btn-primary" onClick={handleAddTag}><Plus size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag.id} className="badge" style={{ background: tag.color + '20', color: tag.color, border: `1px solid ${tag.color}` }}>
              {tag.name}
              <button onClick={async () => { await window.electron.tags.delete(tag.id); loadTags(); }} style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>x</button>
            </span>
          ))}
          {tags.length === 0 && <p className="text-muted">No tags created yet</p>}
        </div>
      </Modal>

      {/* Bulk Tag Modal */}
      <Modal isOpen={showBulkTagModal} onClose={() => setShowBulkTagModal(false)} title={`Tag ${selectedContacts.length} Contacts`}
        footer={<button className="btn btn-secondary" onClick={() => setShowBulkTagModal(false)}>Cancel</button>}>
        <p className="text-muted mb-4">Select a tag to apply to {selectedContacts.length} selected contacts:</p>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <button
              key={tag.id}
              className="btn btn-outline btn-sm"
              style={{ borderColor: tag.color, color: tag.color }}
              onClick={() => handleBulkTag(tag.id)}
            >
              <Tag size={12} /> {tag.name}
            </button>
          ))}
          {tags.length === 0 && (
            <div className="text-muted">
              <p>No tags available. Create a tag first.</p>
              <button className="btn btn-outline btn-sm mt-2" onClick={() => { setShowBulkTagModal(false); setShowTagModal(true); }}>
                <Plus size={14} /> Create Tag
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Contact Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailContact(null); }}
        title="Contact Details"
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setShowDetailModal(false); setDetailContact(null); }}>Close</button>
            {detailContact && (
              <button className="btn btn-primary" onClick={() => { setShowDetailModal(false); handleOpenModal(detailContact); }}>
                <Edit2 size={14} /> Edit
              </button>
            )}
          </>
        }
      >
        {detailContact && (
          <div>
            {/* Contact header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '22px',
                fontWeight: 'bold',
                flexShrink: 0
              }}>
                {(detailContact.firstName || detailContact.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>
                  {getDisplayName(detailContact) || detailContact.email}
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{detailContact.email}</div>
                {detailContact.company && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{detailContact.company}</div>}
              </div>
              <div>{getVerificationBadge(detailContact)}</div>
            </div>

            {/* Engagement score bar */}
            <div style={{ marginBottom: '20px' }}>
              <div className="flex justify-between items-center mb-2">
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Engagement Score</span>
                <span style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: getEngagementColor(detailContact.engagementScore || 0)
                }}>
                  {detailContact.engagementScore || 0}/100
                </span>
              </div>
              <div style={{
                width: '100%',
                height: '10px',
                background: 'var(--bg-tertiary)',
                borderRadius: '5px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(detailContact.engagementScore || 0, 100)}%`,
                  height: '100%',
                  background: getEngagementColor(detailContact.engagementScore || 0),
                  borderRadius: '5px',
                  transition: 'width 0.3s'
                }} />
              </div>
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
              {[
                { label: 'Phone', value: detailContact.phone },
                { label: 'List', value: getListLabel(detailContact) },
                { label: 'Custom Field 1', value: detailContact.customField1 },
                { label: 'Custom Field 2', value: detailContact.customField2 },
                { label: 'Added', value: detailContact.createdAt ? new Date(detailContact.createdAt).toLocaleString() : null },
                { label: 'Updated', value: detailContact.updatedAt ? new Date(detailContact.updatedAt).toLocaleString() : null }
              ].map((item, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>{item.label}</div>
                  <div>{item.value || '-'}</div>
                </div>
              ))}
            </div>

            {/* Activity history */}
            {detailContact.history && detailContact.history.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Activity History</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {detailContact.history.map((event, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 0',
                      borderBottom: i < detailContact.history.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: '12px'
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: event.type === 'open' ? 'var(--success)' : event.type === 'bounce' ? 'var(--error)' : 'var(--accent)',
                        flexShrink: 0
                      }} />
                      <span style={{ flex: 1 }}>{event.message}</span>
                      <span className="text-muted">{event.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Contacts;
