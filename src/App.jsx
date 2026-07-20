import { useState, useEffect, useMemo } from 'react';
import './App.css';

const getRootDomain = (urlStr) => {
  try {
    let hostname = new URL(urlStr).hostname;
    hostname = hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    const secondToLast = parts[parts.length - 2];
    const last = parts[parts.length - 1];
    if (['co', 'org', 'net', 'com', 'ltd', 'plc', 'sch', 'gov', 'nhs'].includes(secondToLast) && ['uk', 'za', 'au', 'nz', 'mx', 'br'].includes(last)) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch(e) {
    return urlStr;
  }
};

const faviconSessionCache = {};

function LeadCard({ lead, showDate, onExclude, isEven, onContact }) {
  const [copied, setCopied] = useState(false);
  const [isExcluding, setIsExcluding] = useState(false);
  const [isExcluded, setIsExcluded] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [exclusionId, setExclusionId] = useState(null);
  const [undoTimer, setUndoTimer] = useState(null);
  const [faviconUrl, setFaviconUrl] = useState(null);
  const [faviconStatus, setFaviconStatus] = useState('loading');

  useEffect(() => {
    if (!lead.website || lead.name === 'Error') {
      setFaviconStatus('error');
      return;
    }
    let domain = '';
    let origin = '';
    try {
      const urlObj = new URL(lead.website);
      domain = urlObj.hostname;
      origin = urlObj.origin;
    } catch(e) {
      setFaviconStatus('error');
      return;
    }

    if (faviconSessionCache[domain]) {
      if (faviconSessionCache[domain] === 'fallback') {
        setFaviconStatus('error');
      } else {
        setFaviconUrl(faviconSessionCache[domain]);
        setFaviconStatus('loaded');
      }
      return;
    }

    setFaviconUrl(`${origin}/favicon.ico`);
    setFaviconStatus('loading');
  }, [lead.website, lead.name]);

  const handleCopy = () => {
    const name = lead.name !== 'Error' ? lead.name : '';
    const text = `${name}, ${lead.email || ''}, ${lead.website || ''}, ${lead.service || ''}, ${lead.location || ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };



  const confirmExclude = async () => {
    if (!lead.website || lead.name === 'Error') return;
    const domain = getRootDomain(lead.website);
    
    setIsExcluding(true);
    try {
      const res = await fetch('/api/exclusions/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      if (res.ok) {
        const data = await res.json();
        setExclusionId(data.id);
        setIsExcluded(true);
        setShowConfirm(false);
        
        const timer = setTimeout(() => {
          if (onExclude) onExclude(lead.website);
        }, 5000);
        setUndoTimer(timer);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to exclude domain');
      }
    } catch(e) {
      console.error(e);
      alert('Network error');
    }
    setIsExcluding(false);
  };

  const handleUndo = async () => {
    if (undoTimer) clearTimeout(undoTimer);
    setUndoTimer(null);
    setIsExcluded(false);
    
    if (exclusionId) {
      try {
        await fetch(`/api/exclusions/domains/${exclusionId}`, {
          method: 'DELETE'
        });
      } catch(e) {
        console.error("Failed to delete database exclusion:", e);
      }
    }
  };

  if (isExcluded) {
    const domain = getRootDomain(lead.website);
    return (
      <div style={{ padding: '1rem 1.25rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>
          <strong style={{ fontFamily: 'monospace' }}>{domain}</strong> has been added to Lead Exclusions.
        </div>
        <button 
          onClick={handleUndo}
          style={{ background: 'transparent', color: '#10b981', border: '1px solid #10b981', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
        >
          Undo
        </button>
      </div>
    );
  }

  if (showConfirm) {
    const domain = getRootDomain(lead.website);
    return (
      <div style={{ padding: '1.25rem', backgroundColor: 'rgba(239, 68, 68, 0.03)', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.05rem' }}>Exclude this domain from all future searches?</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'monospace' }}>{domain}</div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={confirmExclude} 
            disabled={isExcluding}
            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.45rem 1.4rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
          >
            {isExcluding ? 'Excluding...' : 'Yes'}
          </button>
          <button 
            onClick={() => setShowConfirm(false)} 
            style={{ background: 'var(--border-color)', color: '#fff', border: 'none', padding: '0.45rem 1.4rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
          >
            No
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '0.8rem 1.5rem', 
      backgroundColor: isEven ? 'var(--bg-color)' : 'rgba(255, 255, 255, 0.015)', 
      borderRadius: 'var(--radius-md)', 
      border: '1px solid var(--border-color)', 
      display: 'flex', 
      justifyContent: 'space-between',
      alignItems: 'center', 
      gap: '1rem' 
    }}>
      
      {/* Left Column: Business Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', flexShrink: 0, marginRight: '8px' }}>
            {(faviconStatus === 'error' || faviconStatus === 'loading') ? (
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            ) : null}
            {faviconUrl && (
              <img 
                src={faviconUrl} 
                alt="" 
                onLoad={() => {
                  try {
                    const domain = new URL(lead.website).hostname;
                    faviconSessionCache[domain] = faviconUrl;
                    setFaviconStatus('loaded');
                  } catch(e) {}
                }}
                onError={() => {
                  try {
                    const urlObj = new URL(lead.website);
                    const domain = urlObj.hostname;
                    const origin = urlObj.origin;
                    if (faviconUrl === `${origin}/favicon.ico`) {
                      const googleFallback = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                      setFaviconUrl(googleFallback);
                    } else {
                      faviconSessionCache[domain] = 'fallback';
                      setFaviconStatus('error');
                    }
                  } catch(e) {
                    setFaviconStatus('error');
                  }
                }}
                style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'contain', display: faviconStatus === 'loaded' ? 'block' : 'none' }}
              />
            )}
          </div>
          <div style={{ fontWeight: '800', fontSize: '1.25rem', color: lead.name === 'Error' ? '#ef4444' : 'var(--text-main)', marginRight: '10px' }}>
            {lead.name !== 'Error' ? lead.name : 'Failed to fetch'}
          </div>
          <button 
            onClick={handleCopy}
            style={{ background: copied ? '#10b981' : 'transparent', color: copied ? '#fff' : 'var(--text-secondary)', border: `1px solid ${copied ? '#10b981' : 'var(--border-color)'}`, opacity: 0.8, padding: '0.12rem 0.4rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 'normal', transition: 'all 0.2s' }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 'normal', opacity: 0.65 }}>
            {lead.website}
          </a>
          <span>•</span>
          <div>
            Service: <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{lead.service || 'unknown'}</span>
          </div>
          <span>•</span>
          <div>
            Location: <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{lead.location || 'unknown'}</span>
          </div>
          <span>•</span>
          <div>
            {lead.email ? (
              <span>Email: <a href={`mailto:${lead.email}`} style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>{lead.email}</a></span>
            ) : (
              <span>No email found</span>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {lead.name !== 'Error' && !lead.isPlaceholder && (!lead.category || lead.category === 'qualified') ? (
          <>
            <button 
              onClick={() => onContact && onContact()}
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.35rem 1.1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', minWidth: '75px' }}
            >
              Contact
            </button>
            <button 
              onClick={() => setShowConfirm(true)}
              style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.35rem 1.1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', minWidth: '75px' }}
            >
              Exclude
            </button>
          </>
        ) : null}

        {lead.category && lead.category !== 'qualified' && (
          <div style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            backgroundColor: lead.category === 'directory' ? 'rgba(245, 158, 11, 0.15)' :
                             lead.category === 'supplier' ? 'rgba(99, 102, 241, 0.15)' :
                             'rgba(239, 68, 68, 0.15)',
            color: lead.category === 'directory' ? '#f59e0b' :
                   lead.category === 'supplier' ? '#6366f1' :
                   '#ef4444',
            border: lead.category === 'directory' ? '1px solid rgba(245, 158, 11, 0.3)' :
                    lead.category === 'supplier' ? '1px solid rgba(99, 102, 241, 0.3)' :
                    '1px solid rgba(239, 68, 68, 0.3)'
          }}>
            {lead.category === 'directory' ? 'Directory' :
             lead.category === 'supplier' ? 'Supplier' :
             'Excluded'}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [serviceQuery, setServiceQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  
  const [urls, setUrls] = useState('');
  const [results, setResults] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('qualified');
  const [isExtracting, setIsExtracting] = useState(false);

  const [savedSearches, setSavedSearches] = useState([]);
  const [isDbLoading, setIsDbLoading] = useState(false);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');
  const [searchSummary, setSearchSummary] = useState(null);

  const qualifiedLeads = useMemo(() => results.filter(l => l.category === 'qualified' || !l.category), [results]);
  
  const directoryLeads = useMemo(() => {
    const list = results.filter(l => l.category === 'directory');
    if (list.length === 0 && searchSummary && searchSummary.directoriesRemoved > 0) {
      return Array.from({ length: searchSummary.directoriesRemoved }).map((_, idx) => ({
        id: `dir-placeholder-${idx}`,
        name: 'Historical Directory Log',
        website: 'URL filtered during search pre-processing',
        category: 'directory',
        isPlaceholder: true
      }));
    }
    return list;
  }, [results, searchSummary]);

  const supplierLeads = useMemo(() => {
    const list = results.filter(l => l.category === 'supplier');
    if (list.length === 0 && searchSummary && searchSummary.suppliersRemoved > 0) {
      return Array.from({ length: searchSummary.suppliersRemoved }).map((_, idx) => ({
        id: `supplier-placeholder-${idx}`,
        name: 'Historical Supplier Log',
        website: 'Supplier filtered during verification',
        category: 'supplier',
        isPlaceholder: true
      }));
    }
    return list;
  }, [results, searchSummary]);

  const excludedLeads = useMemo(() => {
    const list = results.filter(l => l.category === 'excluded');
    if (list.length === 0 && searchSummary && searchSummary.excludedDomainsRemoved > 0) {
      return Array.from({ length: searchSummary.excludedDomainsRemoved }).map((_, idx) => ({
        id: `excluded-placeholder-${idx}`,
        name: 'Historical Excluded Log',
        website: 'Excluded domain filtered during pre-processing',
        category: 'excluded',
        isPlaceholder: true
      }));
    }
    return list;
  }, [results, searchSummary]);

  const filteredLeads = useMemo(() => {
    if (selectedCategory === 'qualified') return qualifiedLeads;
    if (selectedCategory === 'directory') return directoryLeads;
    if (selectedCategory === 'supplier') return supplierLeads;
    if (selectedCategory === 'excluded') return excludedLeads;
    return [];
  }, [selectedCategory, qualifiedLeads, directoryLeads, supplierLeads, excludedLeads]);

  const [activeTab, setActiveTab] = useState('finder');
  const [selectedLead, setSelectedLead] = useState(null);
  const [previousTab, setPreviousTab] = useState('finder');
  const [excludedDomains, setExcludedDomains] = useState([]);
  const [excludedTypes, setExcludedTypes] = useState([]);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [newTypeInput, setNewTypeInput] = useState('');
  const [exclusionsError, setExclusionsError] = useState('');
  const [isExclusionsLoading, setIsExclusionsLoading] = useState(false);

  const loadExclusions = async () => {
    setIsExclusionsLoading(true);
    try {
      const res = await fetch('/api/exclusions');
      if (res.ok) {
        const data = await res.json();
        setExcludedDomains(data.domains || []);
        setExcludedTypes(data.businessTypes || []);
      }
    } catch(e) {
      console.error(e);
      setExclusionsError('Failed to load exclusions.');
    }
    setIsExclusionsLoading(false);
  };

  const handleExcludeLead = (website) => {
    setResults(prev => prev.filter(r => r.website !== website));
    
    // Also remove the domain from the URL Input Mode textarea
    let domain = '';
    try {
      domain = getRootDomain(website);
    } catch(e) {
      domain = website;
    }
    
    setUrls(prev => {
      if (!prev) return '';
      const lines = prev.split('\n');
      const filteredLines = lines.filter(line => {
        if (!line.trim()) return false;
        try {
          const lineDomain = getRootDomain(line);
          return lineDomain !== domain;
        } catch(e) {
          return line.toLowerCase() !== website.toLowerCase();
        }
      });
      return filteredLines.join('\n');
    });

    loadExclusions();
  };

  const handleAddDomain = async () => {
    if (!newDomainInput.trim()) return;
    setExclusionsError('');
    try {
      const res = await fetch('/api/exclusions/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomainInput.trim() })
      });
      if (res.ok) {
        setNewDomainInput('');
        loadExclusions();
      } else {
        const data = await res.json();
        setExclusionsError(data.error || 'Failed to add domain');
      }
    } catch(e) {
      setExclusionsError('Network error');
    }
  };

  const handleDeleteDomain = async (id) => {
    setExclusionsError('');
    try {
      const res = await fetch(`/api/exclusions/domains/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadExclusions();
      } else {
        setExclusionsError('Failed to delete domain');
      }
    } catch(e) {
      setExclusionsError('Network error');
    }
  };

  const handleAddType = async () => {
    if (!newTypeInput.trim()) return;
    setExclusionsError('');
    try {
      const res = await fetch('/api/exclusions/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTypeInput.trim() })
      });
      if (res.ok) {
        setNewTypeInput('');
        loadExclusions();
      } else {
        const data = await res.json();
        setExclusionsError(data.error || 'Failed to add business type');
      }
    } catch(e) {
      setExclusionsError('Network error');
    }
  };

  const handleDeleteType = async (id) => {
    setExclusionsError('');
    try {
      const res = await fetch(`/api/exclusions/types/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadExclusions();
      } else {
        setExclusionsError('Failed to delete business type');
      }
    } catch(e) {
      setExclusionsError('Network error');
    }
  };

  const loadSavedSearches = async () => {
    setIsDbLoading(true);
    try {
      const response = await fetch('/api/searches');
      if (response.ok) {
        const data = await response.json();
        setSavedSearches(data || []);
      } else {
        alert('Failed to load saved searches');
      }
    } catch (err) {
      console.error(err);
      alert('Error loading saved searches');
    }
    setIsDbLoading(false);
  };

  useEffect(() => {
    loadExclusions();
    loadSavedSearches();
  }, []);

  const [activeSearchId, setActiveSearchId] = useState(null);
  const [pollingIntervalId, setPollingIntervalId] = useState(null);

  useEffect(() => {
    return () => {
      if (pollingIntervalId) clearInterval(pollingIntervalId);
    };
  }, [pollingIntervalId]);

  const handleOpenSavedSearch = async (id) => {
    try {
      const response = await fetch(`/api/searches/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSearchError('');
        setServiceQuery(data.service || '');
        setLocationQuery(data.location || '');
        setResults(data.leads || []);
        setSelectedCategory('qualified');
        if (data.leads) {
          setUrls(data.leads.map(l => l.website).join('\n'));
        }
        setSearchSummary({
          provider: data.provider || 'Bing',
          rawCount: data.raw_count || 0,
          uniqueCount: data.unique_count || 0,
          qualifiedCount: data.qualified_count || 0,
          directoriesRemoved: data.directories_removed || 0,
          suppliersRemoved: data.suppliers_removed || 0,
          excludedDomainsRemoved: data.excluded_domains_removed || 0
        });
        setActiveSearchId(data.id);
        setActiveTab('finder');

        if (pollingIntervalId) {
          clearInterval(pollingIntervalId);
        }

        if (data.status === 'Searching') {
          setIsSearching(true);
          const interval = setInterval(async () => {
            try {
              const res = await fetch(`/api/searches/${data.id}`);
              if (res.ok) {
                const searchData = await res.json();
                setResults(searchData.leads || []);
                setSearchSummary({
                  provider: searchData.provider,
                  rawCount: searchData.raw_count,
                  uniqueCount: searchData.unique_count,
                  qualifiedCount: searchData.qualified_count,
                  directoriesRemoved: searchData.directories_removed,
                  suppliersRemoved: searchData.suppliers_removed,
                  excludedDomainsRemoved: searchData.excluded_domains_removed
                });
                
                if (searchData.status === 'Completed') {
                  clearInterval(interval);
                  setIsSearching(false);
                  loadSavedSearches();
                }
              } else {
                clearInterval(interval);
                setIsSearching(false);
                setActiveSearchId(null);
                setSearchError('No websites found for this query.');
              }
            } catch (e) {
              clearInterval(interval);
              setIsSearching(false);
            }
          }, 2000);
          setPollingIntervalId(interval);
        } else {
          setIsSearching(false);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        alert('Failed to open saved search');
      }
    } catch (err) {
      console.error(err);
      alert('Error opening saved search');
    }
  };

  const handleDeleteSearch = async (id) => {
    if (!confirm('Are you sure you want to delete this search? All associated leads will be deleted.')) return;
    try {
      const response = await fetch(`/api/searches/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        loadSavedSearches();
        if (activeSearchId === id) {
          setResults([]);
          setSearchSummary(null);
          setActiveSearchId(null);
          if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
          }
          setIsSearching(false);
        }
      } else {
        alert('Failed to delete search');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting search');
    }
  };

  const handleSearch = async () => {
    console.log("Search triggered");
    if (!serviceQuery || !locationQuery) {
      setSearchError('Service and Location are required');
      return;
    }
    
    setSearchError('');
    setIsSearching(true);
    
    setResults([]);
    setUrls('');
    setSearchSummary(null);
    setActiveSearchId(null);
    setSelectedCategory('qualified');

    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
    }
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceQuery, location: locationQuery })
      });

      if (response.ok) {
        const data = await response.json();
        setActiveSearchId(data.id);
        loadSavedSearches();
        
        const interval = setInterval(async () => {
          try {
            const res = await fetch(`/api/searches/${data.id}`);
            if (res.ok) {
              const searchData = await res.json();
              setResults(searchData.leads || []);
              setSearchSummary({
                provider: searchData.provider,
                rawCount: searchData.raw_count,
                uniqueCount: searchData.unique_count,
                qualifiedCount: searchData.qualified_count,
                directoriesRemoved: searchData.directories_removed,
                suppliersRemoved: searchData.suppliers_removed,
                excludedDomainsRemoved: searchData.excluded_domains_removed
              });
              
              if (searchData.status === 'Completed') {
                clearInterval(interval);
                setIsSearching(false);
                loadSavedSearches();
              }
            } else {
              clearInterval(interval);
              setIsSearching(false);
              setActiveSearchId(null);
              setSearchError('No websites found for this query.');
            }
          } catch (e) {
            clearInterval(interval);
            setIsSearching(false);
          }
        }, 2000);
        setPollingIntervalId(interval);
      } else {
        const errorData = await response.json();
        setSearchError(errorData.error || 'Failed to search websites.');
        setIsSearching(false);
      }
    } catch (err) {
      console.error(err);
      setSearchError('Network error while searching.');
      setIsSearching(false);
    }
  };

  const handleContactLead = (lead) => {
    setPreviousTab(activeTab);
    setSelectedLead(lead);
    setActiveTab('lead-details');
  };

  return (
    <div className="app-container">
      <header className="header">
        <div style={{ color: '#eab308', fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>TEST</div>
        <h1>TSE Lead Finder</h1>
        <p>Find business websites and extract contact details.</p>
      </header>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem', paddingBottom: '0.5rem' }}>
        <button 
          onClick={() => setActiveTab('finder')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'finder' ? 'var(--accent-color)' : 'var(--text-secondary)',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            cursor: 'pointer',
            padding: '0.5rem 1rem',
            borderBottom: activeTab === 'finder' ? '3px solid var(--accent-color)' : '3px solid transparent',
            marginBottom: '-0.75rem',
            transition: 'all 0.2s'
          }}
        >
          Lead Finder
        </button>
        <button 
          onClick={() => { setActiveTab('searches'); loadSavedSearches(); }}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'searches' ? 'var(--accent-color)' : 'var(--text-secondary)',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            cursor: 'pointer',
            padding: '0.5rem 1rem',
            borderBottom: activeTab === 'searches' ? '3px solid var(--accent-color)' : '3px solid transparent',
            marginBottom: '-0.75rem',
            transition: 'all 0.2s'
          }}
        >
          Saved Searches
        </button>
        <button 
          onClick={() => setActiveTab('exclusions')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'exclusions' ? 'var(--accent-color)' : 'var(--text-secondary)',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            cursor: 'pointer',
            padding: '0.5rem 1rem',
            borderBottom: activeTab === 'exclusions' ? '3px solid var(--accent-color)' : '3px solid transparent',
            marginBottom: '-0.75rem',
            transition: 'all 0.2s'
          }}
        >
          Lead Exclusions
        </button>
      </div>

      {activeTab === 'finder' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Search Mode Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 1rem 0', color: 'var(--text-main)' }}>Search Mode</h2>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="service">Service</label>
                  <input type="text" id="service" className="input-textarea" placeholder="e.g. plumber" value={serviceQuery} onChange={e => setServiceQuery(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="location">Location</label>
                  <input type="text" id="location" className="input-textarea" placeholder="e.g. London" value={locationQuery} onChange={e => setLocationQuery(e.target.value)} />
                </div>
              </div>
              {searchError && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 'bold' }}>{searchError}</div>}
            </div>
            <button 
              className="btn-generate" 
              onClick={handleSearch}
              disabled={isSearching || isExtracting}
              style={{ marginTop: '1.5rem' }}
            >
              {isSearching ? 'Loading...' : 'Find Websites'}
            </button>
          </div>

          <div className="card">
            {results.length > 0 && (
              <div style={{ marginTop: 0 }}>
                {searchSummary && (
                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2.5rem'
                  }}>
                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Provider</div>
                      <div style={{ fontWeight: '800', fontSize: '1.15rem', color: 'var(--text-main)', marginTop: '0.5rem' }}>{searchSummary.provider}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem 1rem', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Raw Results</div>
                      <div style={{ fontWeight: '800', fontSize: '3.3rem', color: '#10b981', marginTop: '0.25rem', lineHeight: '1.1' }}>{searchSummary.rawCount}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem 1rem', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Domains</div>
                      <div style={{ fontWeight: '800', fontSize: '3.3rem', color: '#10b981', marginTop: '0.25rem', lineHeight: '1.1' }}>{searchSummary.uniqueCount}</div>
                    </div>
                    {/* Qualified Leads Tile */}
                    <div 
                      onClick={() => setSelectedCategory('qualified')}
                      style={selectedCategory === 'qualified' ? {
                        backgroundColor: 'rgba(16, 185, 129, 0.08)',
                        border: '2px solid #10b981',
                        boxShadow: '0 0 12px rgba(16, 185, 129, 0.25)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem 1rem',
                        textAlign: 'center',
                        transform: 'scale(1.02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      } : {
                        backgroundColor: 'rgba(15, 23, 42, 0.3)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem 1rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ color: '#10b981', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>Qualified Leads</div>
                      <div style={{ fontWeight: '800', fontSize: selectedCategory === 'qualified' ? '4.0rem' : '3.3rem', color: '#10b981', marginTop: '0.25rem', lineHeight: '1.1' }}>
                        {qualifiedLeads.length}
                      </div>
                    </div>

                    {/* Directories Tile */}
                    <div 
                      onClick={() => setSelectedCategory('directory')}
                      style={selectedCategory === 'directory' ? {
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        border: '2px solid #ef4444',
                        boxShadow: '0 0 12px rgba(239, 68, 68, 0.25)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem 1rem',
                        textAlign: 'center',
                        transform: 'scale(1.02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      } : {
                        backgroundColor: 'rgba(15, 23, 42, 0.3)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem 1rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ color: selectedCategory === 'directory' ? '#ef4444' : 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: selectedCategory === 'directory' ? 'bold' : 'normal' }}>Directories</div>
                      <div style={{ fontWeight: '800', fontSize: selectedCategory === 'directory' ? '4.0rem' : '3.3rem', color: '#ef4444', marginTop: '0.25rem', lineHeight: '1.1' }}>
                        {directoryLeads.length > 0 ? `-${directoryLeads.length}` : '0'}
                      </div>
                    </div>

                    {/* Suppliers Tile */}
                    <div 
                      onClick={() => setSelectedCategory('supplier')}
                      style={selectedCategory === 'supplier' ? {
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        border: '2px solid #ef4444',
                        boxShadow: '0 0 12px rgba(239, 68, 68, 0.25)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem 1rem',
                        textAlign: 'center',
                        transform: 'scale(1.02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      } : {
                        backgroundColor: 'rgba(15, 23, 42, 0.3)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem 1rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ color: selectedCategory === 'supplier' ? '#ef4444' : 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: selectedCategory === 'supplier' ? 'bold' : 'normal' }}>Suppliers</div>
                      <div style={{ fontWeight: '800', fontSize: selectedCategory === 'supplier' ? '4.0rem' : '3.3rem', color: '#ef4444', marginTop: '0.25rem', lineHeight: '1.1' }}>
                        {supplierLeads.length > 0 ? `-${supplierLeads.length}` : '0'}
                      </div>
                    </div>

                    {/* Excluded Tile */}
                    <div 
                      onClick={() => setSelectedCategory('excluded')}
                      style={selectedCategory === 'excluded' ? {
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        border: '2px solid #ef4444',
                        boxShadow: '0 0 12px rgba(239, 68, 68, 0.25)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem 1rem',
                        textAlign: 'center',
                        transform: 'scale(1.02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      } : {
                        backgroundColor: 'rgba(15, 23, 42, 0.3)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem 1rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ color: selectedCategory === 'excluded' ? '#ef4444' : 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: selectedCategory === 'excluded' ? 'bold' : 'normal' }}>Excluded</div>
                      <div style={{ fontWeight: '800', fontSize: selectedCategory === 'excluded' ? '4.0rem' : '3.3rem', color: '#ef4444', marginTop: '0.25rem', lineHeight: '1.1' }}>
                        {excludedLeads.length > 0 ? `-${excludedLeads.length}` : '0'}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  borderBottom: '1px solid var(--border-color)', 
                  padding: '0.75rem 0', 
                  position: 'sticky', 
                  top: 0, 
                  backgroundColor: 'var(--card-bg)', 
                  zIndex: 10,
                  marginBottom: '1rem'
                }}>
                  <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Results</h3>
                  {activeSearchId && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Search ID: <strong style={{ fontFamily: 'monospace' }}>#{activeSearchId}</strong>
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1.5rem' }}>
                  {filteredLeads.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                      No {selectedCategory === 'qualified' ? 'qualified' : selectedCategory} leads found in this search.
                    </div>
                  ) : (
                    filteredLeads.map((r, i) => (
                      <LeadCard key={i} lead={r} showDate={false} onExclude={handleExcludeLead} isEven={i % 2 === 0} onContact={() => handleContactLead(r)} />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'var(--text-main)' }}>Recent Searches</h2>
              <button 
                className="btn-generate" 
                onClick={() => setActiveTab('searches')} 
                style={{ width: 'auto', padding: '0.5rem 1rem', marginTop: 0 }}
              >
                View All Searches
              </button>
            </div>

            {savedSearches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                No recent searches found. Run a search to get started.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>Search Name</th>
                      <th style={{ padding: '0.75rem' }}>Created</th>
                      <th style={{ padding: '0.75rem' }}>Status</th>
                      <th style={{ padding: '0.75rem' }}>Qualified Leads</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedSearches.slice(0, 5).map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{s.name || `${s.service} - ${s.location}`}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(s.date_created).toLocaleString()}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold',
                            backgroundColor: s.status === 'Searching' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: s.status === 'Searching' ? '#3b82f6' : '#10b981',
                            border: s.status === 'Searching' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
                          }}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: 'bold', color: '#10b981' }}>{s.qualified_count || s.leads_count || 0}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <button 
                            className="btn-generate"
                            onClick={() => handleOpenSavedSearch(s.id)}
                            style={{ width: 'auto', padding: '0.25rem 0.75rem', margin: 0, fontSize: '0.8rem' }}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'searches' && (
        <div className="fade-in">
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-main)' }}>Saved Searches</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                  Manage and reopen all historical search projects.
                </p>
              </div>
              <button 
                className="btn-generate" 
                onClick={loadSavedSearches} 
                disabled={isDbLoading} 
                style={{ width: 'auto', padding: '0.5rem 1rem', marginTop: 0 }}
              >
                {isDbLoading ? 'Refreshing...' : 'Refresh List'}
              </button>
            </div>

            {savedSearches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-secondary)' }}>
                No saved searches found. Go to the Lead Finder tab to run a new search.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>Search Name</th>
                      <th style={{ padding: '0.75rem' }}>Service</th>
                      <th style={{ padding: '0.75rem' }}>Location</th>
                      <th style={{ padding: '0.75rem' }}>Created</th>
                      <th style={{ padding: '0.75rem' }}>Status</th>
                      <th style={{ padding: '0.75rem' }}>Qualified Leads</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedSearches.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{s.name || `${s.service} - ${s.location}`}</td>
                        <td style={{ padding: '0.75rem' }}>{s.service}</td>
                        <td style={{ padding: '0.75rem' }}>{s.location}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(s.date_created).toLocaleString()}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold',
                            backgroundColor: s.status === 'Searching' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: s.status === 'Searching' ? '#3b82f6' : '#10b981',
                            border: s.status === 'Searching' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
                          }}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: 'bold', color: '#10b981' }}>{s.qualified_count || s.leads_count || 0}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn-generate"
                            onClick={() => handleOpenSavedSearch(s.id)}
                            style={{ width: 'auto', padding: '0.25rem 0.75rem', margin: 0, fontSize: '0.8rem' }}
                          >
                            Open
                          </button>
                          <button 
                            className="btn-generate"
                            onClick={() => handleDeleteSearch(s.id)}
                            style={{ width: 'auto', padding: '0.25rem 0.75rem', margin: 0, fontSize: '0.8rem', backgroundColor: '#ef4444', border: 'none' }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'exclusions' && (
        <div className="fade-in">
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)' }}>Lead Exclusion Manager</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Define domains and business type keywords to filter out irrelevant results automatically during searches.
            </p>

            {exclusionsError && (
              <div style={{ color: '#ef4444', marginBottom: '1.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
                {exclusionsError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              
              {/* Excluded Domains Column */}
              <div style={{ flex: 1, minWidth: '300px' }}>
                <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Excluded Domains</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7, fontWeight: 'normal' }}>({excludedDomains.length} total)</span>
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input 
                    type="text" 
                    className="input-textarea" 
                    placeholder="e.g. which.co.uk" 
                    value={newDomainInput} 
                    onChange={e => setNewDomainInput(e.target.value)} 
                    style={{ marginBottom: 0, padding: '0.5rem' }} 
                  />
                  <button onClick={handleAddDomain} className="btn-generate" style={{ width: 'auto', marginTop: 0, padding: '0.5rem 1rem' }}>
                    Add
                  </button>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.5rem', backgroundColor: 'var(--bg-color)' }}>
                  {excludedDomains.length === 0 ? (
                    <div className="muted" style={{ padding: '1rem', textAlign: 'center' }}>No domain exclusions defined.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {excludedDomains.map(d => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{d.domain}</span>
                          <button 
                            onClick={() => handleDeleteDomain(d.id)}
                            style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', fontWeight: 'bold' }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Excluded Business Types Column */}
              <div style={{ flex: 1, minWidth: '300px' }}>
                <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Excluded Business Types</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7, fontWeight: 'normal' }}>({excludedTypes.length} total)</span>
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input 
                    type="text" 
                    className="input-textarea" 
                    placeholder="e.g. Wholesaler" 
                    value={newTypeInput} 
                    onChange={e => setNewTypeInput(e.target.value)} 
                    style={{ marginBottom: 0, padding: '0.5rem' }} 
                  />
                  <button onClick={handleAddType} className="btn-generate" style={{ width: 'auto', marginTop: 0, padding: '0.5rem 1rem' }}>
                    Add
                  </button>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.5rem', backgroundColor: 'var(--bg-color)' }}>
                  {excludedTypes.length === 0 ? (
                    <div className="muted" style={{ padding: '1rem', textAlign: 'center' }}>No keyword exclusions defined.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {excludedTypes.map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          <span style={{ fontSize: '0.9rem' }}>{t.name}</span>
                          <button 
                            onClick={() => handleDeleteType(t.id)}
                            style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', fontWeight: 'bold' }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {activeTab === 'lead-details' && selectedLead && (
        <div className="fade-in">
          <div className="card" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
            <button 
              onClick={() => setActiveTab(previousTab || 'finder')}
              className="btn-generate"
              style={{ width: 'auto', padding: '0.5rem 1rem', marginBottom: '1.5rem', background: 'var(--border-color)', border: 'none' }}
            >
              ← Back to Results
            </button>
            <h2 style={{ color: 'var(--text-main)', marginBottom: '1.5rem' }}>Lead Details</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'left', marginBottom: '2rem' }}>
              <div>
                <strong style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Company Name</strong>
                <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{selectedLead.name}</span>
              </div>
              <div>
                <strong style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Website</strong>
                <a href={selectedLead.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '1.1rem', color: 'var(--accent-color)', textDecoration: 'none' }}>
                  {selectedLead.website}
                </a>
              </div>
              <div>
                <strong style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Email</strong>
                {selectedLead.email ? (
                  <a href={`mailto:${selectedLead.email}`} style={{ fontSize: '1.1rem', color: 'var(--accent-color)', textDecoration: 'underline' }}>
                    {selectedLead.email}
                  </a>
                ) : (
                  <span style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No email found</span>
                )}
              </div>
            </div>
            <div style={{ 
              padding: '1.5rem', 
              backgroundColor: 'rgba(59, 130, 246, 0.05)', 
              border: '1px dashed #3b82f6', 
              borderRadius: 'var(--radius-md)', 
              color: '#3b82f6', 
              fontWeight: 'bold',
              fontSize: '1.1rem',
              textAlign: 'center'
            }}>
              Lead Details - Coming Soon
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
