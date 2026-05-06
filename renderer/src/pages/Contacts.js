import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Trash2, Edit2, Tag, CheckCircle,
  XCircle, AlertTriangle, ChevronUp, ChevronDown, ArrowUpDown, MoreHorizontal
} from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import useLiveDataRefresh from '../hooks/useLiveDataRefresh';
import {
  ContactsBulkActionsBar,
  ContactsDropOverlay,
  ContactsFiltersToolbar,
  ContactsInsightsGrid,
  ContactsPageHeader,
  ContactsSummaryStats,
  ContactsVerificationProgressCard
} from '../features/contacts/ContactsSurfaceSections';
import ContactsTableCard from '../features/contacts/ContactsTableCard';

const EMPTY_CONTACT_FORM = {
  email: '',
  firstName: '',
  lastName: '',
  company: '',
  phone: '',
  customField1: '',
  customField2: '',
  listId: '',
  tags: []
};

const EMPTY_LIST_FORM = {
  name: '',
  description: '',
  color: '#5bb4d4'
};

const EMPTY_IMPORT_DATA = {
  contacts: [],
  listId: '',
  summary: null,
  sampleContacts: []
};

function Contacts({ isActive }) {
  const { addToast } = useToast();
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [showBulkListModal, setShowBulkListModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [detailContact, setDetailContact] = useState(null);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [importData, setImportData] = useState(EMPTY_IMPORT_DATA);
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

  const [formData, setFormData] = useState(EMPTY_CONTACT_FORM);

  const [newTag, setNewTag] = useState({ name: '', color: '#5bb4d4' });
  const [newList, setNewList] = useState(EMPTY_LIST_FORM);
  const searchTimeoutRef = useRef(null);
  const verifyResultsRef = useRef([]);
  const bulkVerifyingRef = useRef(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    loadLists();
    loadTags();
    loadContactStats();
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

  useEffect(() => {
    setFormData((prev) => {
      const nextListId = prev.listId && !lists.some((list) => list.id === prev.listId) ? '' : prev.listId;
      const nextTags = Array.isArray(prev.tags)
        ? prev.tags.filter((tagId) => tags.some((tag) => tag.id === tagId))
        : [];
      if (nextListId === prev.listId && nextTags.length === prev.tags.length) {
        return prev;
      }
      return { ...prev, listId: nextListId, tags: nextTags };
    });

    setFilters((prev) => {
      const nextListId = prev.listId && !lists.some((list) => list.id === prev.listId) ? '' : prev.listId;
      const nextTag = prev.tag && !tags.some((tag) => tag.id === prev.tag) ? '' : prev.tag;
      if (nextListId === prev.listId && nextTag === prev.tag) {
        return prev;
      }
      return { ...prev, listId: nextListId, tag: nextTag };
    });
  }, [lists, tags]);

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
    // Silent refreshes (from data-change events / polling) skip the loading
    // spinner so the table doesn't flash empty on every background sync.
    if (!overrides.silent) setLoading(true);
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

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

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

  // overrides is forwarded from useLiveDataRefresh -- passing { silent: true }
  // prevents the loading spinner from flashing on every background data-change event.
  const refreshContactsSurface = useCallback(async (overrides = {}) => {
    await Promise.all([
      loadContacts(overrides),
      loadContactStats(),
      loadLists(),
      loadTags()
    ]);
  }, [loadContacts]);

  // React to background data changes (bulk imports, tag mutations, etc.)
  useLiveDataRefresh({
    load: refreshContactsSurface,
    isActive,
    dataTypes: ['contacts', 'lists', 'tags'],
    pollMs: 30000
  });

  // 30-second polling fallback -- guards against missed IPC events when
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

  const closeContactModal = useCallback(() => {
    setShowModal(false);
    setEditingContact(null);
    setFormData(EMPTY_CONTACT_FORM);
  }, []);

  const openImportConfirmation = useCallback((payload) => {
    const contacts = Array.isArray(payload?.contacts) ? payload.contacts : [];
    const sampleContacts = Array.isArray(payload?.sampleContacts) && payload.sampleContacts.length > 0
      ? payload.sampleContacts
      : contacts.slice(0, 100);

    setImportData({
      contacts,
      listId: payload?.listId || payload?.summary?.listId || '',
      summary: payload?.summary || null,
      sampleContacts
    });
    setShowImportModal(true);
  }, []);

  const handleAddList = async () => {
    if (!newList.name.trim()) {
      addToast('List name is required', 'error');
      return;
    }

    try {
      const result = await window.electron.lists.add({
        name: newList.name.trim(),
        description: newList.description.trim(),
        color: newList.color
      });
      if (result?.error) {
        addToast(result.error, 'error');
        return;
      }
      setNewList(EMPTY_LIST_FORM);
      await refreshContactsSurface();
      addToast('List created', 'success');
    } catch (error) {
      addToast('Failed to create list', 'error');
    }
  };

  const handleDeleteList = async (listId) => {
    try {
      await window.electron.lists.delete(listId);
      await refreshContactsSurface();
      addToast('List deleted', 'success');
    } catch (error) {
      addToast('Failed to delete list', 'error');
    }
  };

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
        tags: (() => {
          if (!contact.tags) return [];
          if (typeof contact.tags === 'string') {
            try { return JSON.parse(contact.tags); } catch { return []; }
          }
          return Array.isArray(contact.tags) ? contact.tags : [];
        })()
      });
    } else {
      setEditingContact(null);
      setFormData(EMPTY_CONTACT_FORM);
    }
    setShowModal(true);
  };

  const handleViewDetail = async (contact) => {
    setShowDetailModal(true);
    try {
      const detail = await window.electron?.contacts?.getDetail?.(contact.id);
      if (detail?.error) {
        throw new Error(detail.error);
      }
      setDetailContact(detail || contact);
    } catch (e) {
      setDetailContact(contact);
      addToast('Showing basic contact details only', 'warning');
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
        closeContactModal();
        await loadContacts();
      } else {
        const result = await window.electron.contacts.add({ ...formData, tags: formData.tags });
        if (!result.success) {
          addToast(result.error || 'Failed to add contact', 'error');
          return;
        }
        addToast('Contact added', 'success');
        closeContactModal();
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
        setImportPreview({
          headers: result.headers,
          rows: result.rows,
          mapping: result.autoMapping || {},
          totalRows: result.totalRows || result.rows.length,
          listId: ''
        });
      } else if (result.success && result.contacts?.length > 0) {
        openImportConfirmation({
          contacts: result.contacts,
          listId: '',
          summary: {
            totalRows: result.contacts.length,
            mappedRows: result.contacts.length,
            blankEmailRows: 0,
            invalidEmails: 0,
            duplicateInFile: 0,
            existingDuplicates: 0,
            readyToImport: result.contacts.length,
            skippedRows: 0,
            listId: '',
            listName: ''
          }
        });
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

    try {
      const result = await window.electron.contacts.prepareImport({
        rows,
        mapping,
        listId: listId || ''
      });

      if (!result?.success) {
        addToast(result?.error || 'Failed to prepare import', 'error');
        return;
      }

      openImportConfirmation({
        contacts: result.contacts || [],
        listId: result.summary?.listId || listId || '',
        summary: result.summary || null,
        sampleContacts: result.sampleContacts || []
      });
      setImportPreview(null);

      if ((result.summary?.readyToImport || 0) === 0) {
        addToast('No new contacts are ready to import with the current mapping', 'warning');
      }
    } catch (error) {
      addToast('Import preparation failed: ' + error.message, 'error');
    }
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
      if (result?.error) {
        throw new Error(result.error);
      }
      const details = [];
      if (result?.duplicates) details.push(`${result.duplicates} duplicates`);
      if (result?.invalid) details.push(`${result.invalid} invalid`);
      addToast(`Imported ${result?.inserted || 0} contacts` + (details.length ? ` (${details.join(', ')})` : ''), 'success');

      setShowImportModal(false);
      setImportProgress(null);
      setImportData(EMPTY_IMPORT_DATA);
      await refreshContactsSurface();
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
      const result = await window.electron.verify.email(contact.email, {
        smtpCheck: true,
        timeout: 7000,
        checkCatchAll: false
      });
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

  const handleBulkAddToList = async (listId) => {
    if (selectedContacts.length === 0) return;
    try {
      let result;
      if (window.electron.contacts.addToListBulk) {
        result = await window.electron.contacts.addToListBulk(selectedContacts, listId);
      } else {
        // Fallback: update each contact individually
        await Promise.all(
          selectedContacts.map(id => {
            const contact = contacts.find(c => c.id === id);
            if (contact) return window.electron.contacts.update({ ...contact, listId });
            return Promise.resolve();
          })
        );
        result = { success: true, updated: selectedContacts.length, skipped: 0 };
      }
      if (result?.error) {
        throw new Error(result.error);
      }
      const updated = result?.updated ?? selectedContacts.length;
      const skipped = result?.skipped || 0;
      addToast(
        skipped > 0
          ? `Added ${updated} contact(s) to list (${skipped} already assigned or unavailable)`
          : `Added ${updated} contact(s) to list`,
        'success'
      );
      await refreshContactsSurface();
    } catch (error) {
      addToast('Failed to add contacts to list', 'error');
    }
    setShowBulkListModal(false);
  };

  const handleBulkTag = async (tagId) => {
    if (selectedContacts.length === 0) return;
    try {
      if (window.electron.contacts.addTagBulk) {
        const result = await window.electron.contacts.addTagBulk(selectedContacts, tagId);
        if (result?.error) {
          throw new Error(result.error);
        }
        const updated = result?.updated ?? selectedContacts.length;
        const skipped = result?.skipped || 0;
        addToast(
          skipped > 0
            ? `Tagged ${updated} contact(s) (${skipped} already tagged or unavailable)`
            : `Tagged ${updated} contact(s)`,
          'success'
        );
        await refreshContactsSurface();
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
        refreshContactsSurface();
      } else if (result && result.error) {
        addToast(result.error || 'Failed to create tag', 'error');
      } else {
        addToast('Tag created', 'success');
        setNewTag({ name: '', color: '#5bb4d4' });
        refreshContactsSurface();
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
    setDebouncedSearch(''); // flush immediately -- don't wait for the 350ms debounce
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
    // In Electron, dropped files have a `path` property -- use importRaw with that path
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
    <div className="page-container page-contacts" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} style={{ position: 'relative' }}>
      <ContactsDropOverlay isDragging={isDragging} />

      <ContactsPageHeader
        onImport={handleImport}
        onExport={handleExport}
        onAddContact={() => handleOpenModal()}
      />

      <ContactsSummaryStats contactStats={contactStats} />

      <ContactsInsightsGrid
        contactsCount={contacts.length}
        pagination={pagination}
        verificationCoverage={verificationCoverage}
        classifiedCount={classifiedCount}
        selectedContactsCount={selectedContacts.length}
        selectedVerificationBreakdown={selectedVerificationBreakdown}
        activeFilterCount={activeFilterCount}
      />

      <ContactsFiltersToolbar
        filters={filters}
        setFilters={setFilters}
        setPagination={setPagination}
        lists={lists}
        tags={tags}
        resetFilters={resetFilters}
        refreshContactsSurface={refreshContactsSurface}
        onOpenLists={() => setShowListModal(true)}
        onOpenTags={() => setShowTagModal(true)}
      />

      <ContactsBulkActionsBar
        selectedContactsCount={selectedContacts.length}
        selectedVerificationBreakdown={selectedVerificationBreakdown}
        handleDelete={handleDelete}
        handleExport={handleExport}
        onOpenBulkTag={() => setShowBulkTagModal(true)}
        onOpenBulkList={() => setShowBulkListModal(true)}
        handleBulkVerify={handleBulkVerify}
        isBulkVerifying={isBulkVerifying}
        clearSelection={() => setSelectedContacts([])}
      />

      <ContactsVerificationProgressCard
        isBulkVerifying={isBulkVerifying}
        verifyProgress={verifyProgress}
        verifyLiveResults={verifyLiveResults}
        isVerifyPaused={isVerifyPaused}
        handlePauseVerify={handlePauseVerify}
        handleResumeVerify={handleResumeVerify}
        handleStopVerify={handleStopVerify}
      />

      <ContactsTableCard
        loading={loading}
        contacts={contacts}
        selectedContacts={selectedContacts}
        toggleSelectAll={toggleSelectAll}
        toggleSelect={toggleSelect}
        handleSort={handleSort}
        getSortIcon={getSortIcon}
        getDisplayName={getDisplayName}
        getListLabel={getListLabel}
        getVerificationBadge={getVerificationBadge}
        getEngagementColor={getEngagementColor}
        handleVerifyContact={handleVerifyContact}
        isBulkVerifying={isBulkVerifying}
        verifyingContactId={verifyingContactId}
        handleViewDetail={handleViewDetail}
        handleOpenModal={handleOpenModal}
        pagination={pagination}
        setPagination={setPagination}
      />

      {/* Add/Edit Contact Modal */}
      <Modal
        key={editingContact?.id || 'new'}
        isOpen={showModal}
        onClose={closeContactModal}
        title={editingContact ? 'Edit Contact' : 'Add Contact'}
        footer={<><button className="btn btn-secondary" onClick={closeContactModal}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>Save</button></>}
      >
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
        <div className="form-group">
          <label className="form-label">Tags <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>(click to toggle)</span></label>
          <div className="flex flex-wrap gap-2" style={{ minHeight: '32px' }}>
            {tags.length > 0 ? tags.map(tag => {
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
            }) : (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                No tags yet — create tags from the Tags button above the table.
              </span>
            )}
          </div>
        </div>
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
      <Modal isOpen={showImportModal} onClose={() => { setShowImportModal(false); setImportProgress(null); setImportData(EMPTY_IMPORT_DATA); }} title="Import Contacts" size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowImportModal(false); setImportProgress(null); setImportData(EMPTY_IMPORT_DATA); }}>Cancel</button><button className="btn btn-primary" onClick={confirmImport} disabled={!!importProgress || importData.contacts.length === 0}>
          {importProgress ? `Importing... ${importProgress.current}/${importProgress.total}` : `Import ${importData.contacts.length} Contacts`}
        </button></>}>
        <div className="mb-4" style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
          <p style={{ margin: 0 }}><strong><CheckCircle size={14} style={{ color: 'var(--success)', marginRight: '6px' }} />{importData.summary?.readyToImport ?? importData.contacts.length} contact(s) ready to import</strong></p>
          <p className="text-sm text-muted" style={{ margin: '8px 0 0 0' }}>This stage has already validated email format, removed file duplicates, and filtered out contacts that already exist in Bulky.</p>
        </div>

        {importData.summary && (
          <div className="stats-grid stats-grid-4 mb-4">
            {[
              { label: 'Ready', value: importData.summary.readyToImport || 0, color: 'var(--success)' },
              { label: 'Existing Duplicates', value: importData.summary.existingDuplicates || 0, color: 'var(--warning)' },
              { label: 'File Duplicates', value: importData.summary.duplicateInFile || 0, color: '#5bb4d4' },
              { label: 'Invalid or Blank', value: (importData.summary.invalidEmails || 0) + (importData.summary.blankEmailRows || 0), color: 'var(--error)' }
            ].map((item) => (
              <div key={item.label} className="stat-card" style={{ padding: '14px 16px' }}>
                <div className="stat-content" style={{ textAlign: 'center' }}>
                  <div className="stat-value" style={{ fontSize: '22px', color: item.color }}>{item.value.toLocaleString()}</div>
                  <div className="stat-label">{item.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {importData.listId && (() => {
          const selectedImportList = lists.find((list) => list.id === importData.listId);
          if (!selectedImportList) return null;
          return (
            <div className="mb-4 text-sm text-muted">
              New contacts will be added to <strong style={{ color: 'var(--text)' }}>{selectedImportList.name}</strong>.
            </div>
          );
        })()}

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
              {(importData.sampleContacts.length > 0 ? importData.sampleContacts : importData.contacts.slice(0, 100)).map((c, i) => (
                <tr key={i}><td>{c.email}</td><td>{c.firstName || '-'}</td><td>{c.lastName || '-'}</td><td>{c.company || '-'}</td></tr>
              ))}
            </tbody>
          </table>
          {importData.contacts.length > 100 && <p className="text-muted text-center mt-2">...and {importData.contacts.length - 100} more</p>}
        </div>
      </Modal>

      {/* List Management Modal */}
      <Modal isOpen={showListModal} onClose={() => setShowListModal(false)} title="Manage Lists"
        footer={<button className="btn btn-secondary" onClick={() => setShowListModal(false)}>Close</button>}>
        <div className="form-row" style={{ alignItems: 'end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">List Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Newsletter Subscribers"
              value={newList.name}
              onChange={(e) => setNewList((prev) => ({ ...prev, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleAddList()}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Description</label>
            <input
              type="text"
              className="form-input"
              placeholder="Optional description"
              value={newList.description}
              onChange={(e) => setNewList((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Color</label>
            <input
              type="color"
              value={newList.color}
              onChange={(e) => setNewList((prev) => ({ ...prev, color: e.target.value }))}
              style={{ width: '50px', height: '40px', border: 'none', cursor: 'pointer' }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleAddList}>
            <Plus size={16} /> Add
          </button>
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          {lists.map((list) => (
            <div
              key={list.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 14px',
                background: 'var(--bg-tertiary)',
                borderRadius: '10px',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: list.color || 'var(--accent)' }} />
                  <strong>{list.name}</strong>
                </div>
                <div className="text-sm text-muted">{list.description || 'No description'}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => handleDeleteList(list.id)}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          ))}
          {lists.length === 0 && <p className="text-muted">No contact lists yet. Add one above to start organizing contacts.</p>}
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
              <button onClick={async () => { await window.electron.tags.delete(tag.id); refreshContactsSurface(); }} style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>x</button>
            </span>
          ))}
          {tags.length === 0 && <p className="text-muted">No tags created yet</p>}
        </div>
      </Modal>

      {/* Bulk Add to List Modal */}
      <Modal isOpen={showBulkListModal} onClose={() => setShowBulkListModal(false)} title={`Add ${selectedContacts.length} Contacts to List`}
        footer={<button className="btn btn-secondary" onClick={() => setShowBulkListModal(false)}>Cancel</button>}>
        <p className="text-muted mb-4">Select a list to add {selectedContacts.length} selected contact(s) to:</p>
        <div style={{ display: 'grid', gap: '10px' }}>
          {lists.map(list => (
            <button
              key={list.id}
              className="btn btn-outline"
              style={{ justifyContent: 'flex-start', gap: '10px', padding: '12px 16px' }}
              onClick={() => handleBulkAddToList(list.id)}
            >
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: list.color || 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontWeight: 500 }}>{list.name}</span>
              {list.description && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{list.description}</span>}
            </button>
          ))}
          {lists.length === 0 && (
            <div className="text-muted">
              <p>No lists available. Create a list first.</p>
              <button className="btn btn-outline btn-sm mt-2" onClick={() => { setShowBulkListModal(false); setShowListModal(true); }}>
                <Plus size={14} /> Create List
              </button>
            </div>
          )}
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
