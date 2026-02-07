import React, { useState, useEffect } from 'react';
import {
  Settings,
  Search,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Save,
  LogOut,
  Plus,
  Trash2,
  AlertCircle,
  Menu,
  ChevronRight,
  UserPlus,
  Play,
  Terminal,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ADMIN_EMAIL = 'afrin.tabassum86@gmail.com';
const API_URL = import.meta.env.VITE_API_URL || '';

const AdminPortal = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPost, setSelectedPost] = useState(null);
  const [blogArticles, setBlogArticles] = useState([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [admins, setAdmins] = useState([ADMIN_EMAIL]);
  const [runningScript, setRunningScript] = useState(null);
  const [scriptLogs, setScriptLogs] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch articles from API (PostgreSQL)
        const artResponse = await fetch(`${API_URL}/api/articles`);
        const artData = await artResponse.json();
        setBlogArticles(artData || []);

        // Fetch posts from API (PostgreSQL)
        const postResponse = await fetch(`${API_URL}/api/posts`);
        const postData = await postResponse.json();
        setPosts(postData || []);

      } catch (err) {
        console.error('Data fetch failed:', err);
      }
    };

    fetchData();

    // Poll for script status every 2 seconds if something is running
    const statusInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/script-status`);
        const data = await res.json();
        if (data.status === 'running') {
          setRunningScript(data.script_name || data.script);
          setScriptLogs(`⌛ Script is running...\n`);
        } else if (data.status === 'completed' || data.status === 'error') {
          if (runningScript) {
            setScriptLogs(prev => prev + (data.output || '') + `\n\n${data.status === 'completed' ? '✅ COMPLETED' : '❌ ERROR'}`);
            setRunningScript(null);
          }
        }
      } catch (e) { }
    }, 2000);

    const session = localStorage.getItem('nibs_admin');
    if (session === ADMIN_EMAIL || admins.includes(session)) {
      setIsLoggedIn(true);
    }

    return () => clearInterval(statusInterval);
  }, [runningScript]);

  const saveToDisk = async (updatedPosts) => {
    try {
      const response = await fetch(`${API_URL}/api/save-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: updatedPosts })
      });
      if (!response.ok) throw new Error('Failed to save');
      console.log('Saved to database!');
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const runScript = async (scriptName) => {
    if (runningScript) return;
    setRunningScript(scriptName);
    setScriptLogs(`⌛ Initiating ${scriptName}...\n`);

    try {
      const response = await fetch(`${API_URL}/api/run-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: scriptName })
      });
      const data = await response.json();
      if (data.success) {
        setScriptLogs(prev => prev + `✓ Script accepted. Monitoring progress...\n`);
      } else {
        throw new Error(data.error || 'Failed to start script');
      }
    } catch (err) {
      setScriptLogs(prev => prev + `❌ Error: ${err.message}\nMake sure your server is running.`);
      setRunningScript(null);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (email === ADMIN_EMAIL || admins.includes(email)) {
      setIsLoggedIn(true);
      localStorage.setItem('nibs_admin', email);
    } else {
      alert('Unauthorized access');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('nibs_admin');
  };

  const handleMap = async (postId, blogUrl, blogTitle) => {
    try {
      const cleanTitle = blogTitle.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const response = await fetch(`${API_URL}/api/update-post-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, blogUrl, title: cleanTitle })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Server returned status ' + response.status);
      }

      setPosts(posts.map(p => p.id === postId ? { ...p, blogUrl, title: cleanTitle } : p));
      setSelectedPost(null);
    } catch (err) {
      alert('Failed to map post: ' + err.message + '\nCheck terminal logs for admin-server.js.');
    }
  };

  const handleManualMap = async (postId, url) => {
    try {
      const response = await fetch(`${API_URL}/api/update-post-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, blogUrl: url })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Server returned status ' + response.status);
      }

      setPosts(posts.map(p => p.id === postId ? { ...p, blogUrl: url } : p));
    } catch (err) {
      alert('Failed to update mapping: ' + err.message + '\nCheck terminal logs for admin-server.js.');
    }
  };


  const filteredPosts = posts
    .filter(p => {
      const matchesFilter =
        filter === 'all' ? true :
          filter === 'mapped' ? !!p.blogUrl :
            filter === 'unmapped' ? !p.blogUrl :
              true; // automation filter shows no posts in this grid

      const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.id.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;

      if (timeA && timeB) return timeB - timeA;
      if (timeA) return -1;
      if (timeB) return 1;

      return posts.indexOf(b) - posts.indexOf(a);
    });

  if (!isLoggedIn) {
    return (
      <div className="admin-login-page">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="login-card"
        >
          <div className="login-header">
            <div className="admin-icon">
              <Settings size={32} />
            </div>
            <h1>Admin Access</h1>
            <p>Enter your credentials to manage Nibs Network mapping</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="afrin.tabassum86@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="login-btn">Sign In</button>
          </form>
          <div className="login-footer">
            <AlertCircle size={14} />
            <span>Only authorized administrators can access this portal.</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="admin-portal">
      <nav className="admin-nav">
        <div className="nav-left">
          <Settings size={20} />
          <span>NIBS ADMIN</span>
        </div>
        <div className="nav-right">
          <button
            onClick={() => setShowUserManagement(!showUserManagement)}
            className="nav-btn"
          >
            <UserPlus size={18} />
          </button>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <main className="admin-main">
        {showUserManagement ? (
          <div className="user-management">
            <div className="management-header">
              <h2>User Management</h2>
              <button onClick={() => {
                const newEmail = prompt('Enter new admin email:');
                if (newEmail) setAdmins([...admins, newEmail]);
              }} className="add-btn">
                <Plus size={16} /> Add Admin
              </button>
            </div>
            <div className="admin-list">
              {admins.map(a => (
                <div key={a} className="admin-item">
                  <span>{a}</span>
                  {a !== ADMIN_EMAIL && (
                    <button onClick={() => setAdmins(admins.filter(e => e !== a))}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="back-btn" onClick={() => setShowUserManagement(false)}>Back to Mappings</button>
          </div>
        ) : (
          <>
            <div className="dashboard-header">
              <h1>Mapping Management</h1>
              <div className="header-actions">
                <div className="cloud-status">
                  <CheckCircle2 size={16} color="#10b981" />
                  <span>Live AWS RDS Cloud Sync</span>
                </div>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-card">
                <span className="stat-label">Total Posts</span>
                <span className="stat-value">{posts.length}</span>
              </div>
              <div className="stat-card success">
                <span className="stat-label">Mapped</span>
                <span className="stat-value">{posts.filter(p => p.blogUrl).length}</span>
              </div>
              <div className="stat-card warning">
                <span className="stat-label">Unmapped</span>
                <span className="stat-value">{posts.filter(p => !p.blogUrl).length}</span>
              </div>
            </div>

            <div className="controls-row">
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-tabs">
                <button
                  className={filter === 'all' ? 'active' : ''}
                  onClick={() => setFilter('all')}
                >All</button>
                <button
                  className={filter === 'unmapped' ? 'active' : ''}
                  onClick={() => setFilter('unmapped')}
                >Unmapped</button>
                <button
                  className={filter === 'mapped' ? 'active' : ''}
                  onClick={() => setFilter('mapped')}
                >Mapped</button>
                <button
                  className={filter === 'automation' ? 'active' : ''}
                  onClick={() => setFilter('automation')}
                >
                  <RefreshCw size={14} style={{ marginRight: '6px', display: 'inline' }} />
                  Automation
                </button>
              </div>
            </div>

            {filter === 'automation' ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="automation-panel"
              >
                <div className="panels-grid">
                  <div className="ops-card">
                    <div className="ops-info">
                      <h3>1. Sync Instagram</h3>
                      <p>Main playwright scraper to fetch posts from profile.</p>
                    </div>
                    <button
                      onClick={() => runScript('sync-insta')}
                      disabled={runningScript}
                      className="ops-btn"
                    >
                      {runningScript === 'sync-insta' ? <Loader2 className="spin" /> : <Play size={16} />}
                      Run Sync
                    </button>
                  </div>

                  <div className="ops-card">
                    <div className="ops-info">
                      <h3>2. Sync Blog</h3>
                      <p>Crawl latest articles from nibsnetwork.com.</p>
                    </div>
                    <button
                      onClick={() => runScript('sync-blog')}
                      disabled={runningScript}
                      className="ops-btn"
                    >
                      {runningScript === 'sync-blog' ? <Loader2 className="spin" /> : <Play size={16} />}
                      Crawl Blog
                    </button>
                  </div>

                  <div className="ops-card">
                    <div className="ops-info">
                      <h3>3. OCR Auto-Map</h3>
                      <p>Analyze post images and match with blog articles.</p>
                    </div>
                    <button
                      onClick={() => runScript('auto-map')}
                      disabled={runningScript}
                      className="ops-btn"
                    >
                      {runningScript === 'auto-map' ? <Loader2 className="spin" /> : <Play size={16} />}
                      Run OCR Match
                    </button>
                  </div>

                  <div className="ops-card">
                    <div className="ops-info">
                      <h3>4. Time Sync</h3>
                      <p>Sync correct publish dates from Instagram posts.</p>
                    </div>
                    <button
                      onClick={() => runScript('time-sync')}
                      disabled={runningScript}
                      className="ops-btn"
                    >
                      {runningScript === 'time-sync' ? <Loader2 className="spin" /> : <Play size={16} />}
                      Sync Times
                    </button>
                  </div>
                </div>

                <div className="console-output">
                  <div className="console-header">
                    <Terminal size={14} />
                    <span>Output Logs</span>
                  </div>
                  <pre className="console-text">
                    {scriptLogs || 'Ready to run scripts...'}
                  </pre>
                </div>
              </motion.div>
            ) : (
              <div className="posts-management-grid">
                {filteredPosts.map(post => (
                  <motion.div
                    layout
                    key={post.id}
                    className={`admin-post-card ${post.blogUrl ? 'is-mapped' : 'is-unmapped'}`}
                  >
                    <div className="post-thumb">
                      <img src={post.image} alt="" />
                      {post.blogUrl ? (
                        <div className="status-tag mapped"><CheckCircle2 size={12} /> Mapped</div>
                      ) : (
                        <div className="status-tag unmapped"><XCircle size={12} /> Unmapped</div>
                      )}
                    </div>
                    <div className="post-details">
                      <h3 title={post.title}>{post.title}</h3>
                      <div className="post-links">
                        <a href={post.url} target="_blank" rel="noreferrer" className="ig-link">
                          Instagram <ExternalLink size={12} />
                        </a>
                        {post.blogUrl && (
                          <a href={post.blogUrl} target="_blank" rel="noreferrer" className="blog-link">
                            Blog <ExternalLink size={12} />
                          </a>
                        )}
                      </div>

                      <div className="mapping-controls">
                        {selectedPost === post.id ? (
                          <div className="mapping-selection">
                            <input
                              type="text"
                              placeholder="Search articles..."
                              className="article-search"
                              onChange={(e) => {
                                // Article filtering logic would go here
                              }}
                            />
                            <div className="article-results">
                              {blogArticles.slice(0, 5).map(article => (
                                <button
                                  key={article.url}
                                  onClick={() => handleMap(post.id, article.url, article.title)}
                                  className="article-option"
                                >
                                  {article.title}
                                </button>
                              ))}
                            </div>
                            <button onClick={() => setSelectedPost(null)} className="cancel-btn">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const url = prompt('Enter Blog Article URL for this post:', post.blogUrl || '');
                              if (url) handleManualMap(post.id, url);
                            }}
                            className="map-btn"
                          >
                            {post.blogUrl ? 'Edit Mapping' : 'Manual Map'}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
        .admin-portal {
          background: #f8fafc;
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          color: #1e293b;
        }

        .admin-nav {
          background: #fff;
          border-bottom: 1px solid #e2e8f0;
          padding: 0.75rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .nav-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #6366f1;
        }

        .nav-right {
          display: flex;
          gap: 1rem;
        }

        .nav-btn, .logout-btn {
          padding: 0.5rem;
          border-radius: 0.5rem;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }

        .nav-btn:hover, .logout-btn:hover {
          background: #f1f5f9;
          color: #ef4444;
        }

        .admin-main {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .dashboard-header h1 {
          font-size: 1.875rem;
          font-weight: 800;
          color: #0f172a;
        }

        .save-btn {
          background: #6366f1;
          color: white;
          padding: 0.625rem 1.25rem;
          border-radius: 0.75rem;
          border: none;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          transition: 0.2s;
        }

        .save-btn:hover {
          background: #4f46e5;
          transform: translateY(-1px);
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 1rem;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .stat-label {
          color: #64748b;
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 800;
          color: #0f172a;
        }

        .stat-card.success { border-left: 4px solid #10b981; }
        .stat-card.warning { border-left: 4px solid #f59e0b; }

        .controls-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          gap: 1rem;
        }

        .search-box {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 0 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
        }

        .search-box input {
          border: none;
          padding: 0.75rem 0;
          width: 100%;
          outline: none;
        }

        .filter-tabs {
          display: flex;
          background: #e2e8f0;
          padding: 0.25rem;
          border-radius: 0.75rem;
          gap: 0.25rem;
        }

        .filter-tabs button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 0.5rem;
          background: transparent;
          color: #64748b;
          font-weight: 600;
          cursor: pointer;
          transition: 0.2s;
        }

        .filter-tabs button.active {
          background: white;
          color: #0f172a;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .posts-management-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
        }

        .admin-post-card {
          background: white;
          border-radius: 1rem;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          transition: all 0.2s;
        }

        .admin-post-card:hover {
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }

        .post-thumb {
          height: 160px;
          position: relative;
        }

        .post-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .status-tag {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          padding: 0.25rem 0.625rem;
          border-radius: 99px;
          font-size: 0.75rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          backdrop-filter: blur(8px);
        }

        .status-tag.mapped {
          background: rgba(16, 185, 129, 0.9);
          color: white;
        }

        .status-tag.unmapped {
          background: rgba(245, 158, 11, 0.9);
          color: white;
        }

        .post-details {
          padding: 1rem;
        }

        .post-details h3 {
          font-size: 0.9375rem;
          font-weight: 600;
          margin: 0 0 0.75rem 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          height: 2.5rem;
          line-height: 1.25rem;
        }

        .post-links {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .ig-link, .blog-link {
          font-size: 0.75rem;
          font-weight: 600;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.125rem;
        }

        .ig-link { color: #db2777; }
        .blog-link { color: #6366f1; }

        .map-btn {
          width: 100%;
          padding: 0.625rem;
          border-radius: 0.625rem;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          font-weight: 600;
          cursor: pointer;
          transition: 0.2s;
        }

        .map-btn:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #6366f1;
        }

        .admin-login-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        .login-card {
          background: white;
          padding: 3rem;
          border-radius: 1.5rem;
          width: 100%;
          max-width: 440px;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
        }

        .login-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .admin-icon {
          width: 64px;
          height: 64px;
          background: #f5f3ff;
          color: #6366f1;
          border-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
        }

        .login-header h1 {
          font-size: 1.5rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
        }

        .login-header p {
          color: #64748b;
          font-size: 0.9375rem;
        }

        .input-group {
          margin-bottom: 1.25rem;
        }

        .input-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #475569;
        }

        .input-group input {
          width: 100%;
          padding: 0.75rem;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          outline: none;
          transition: 0.2s;
        }

        .input-group input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
        }

        .login-btn {
          width: 100%;
          padding: 0.75rem;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: 0.2s;
        }

        .login-btn:hover {
          background: #4f46e5;
        }

        .login-footer {
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid #f1f5f9;
          display: flex;
          gap: 0.5rem;
          color: #94a3b8;
          font-size: 0.75rem;
          align-items: center;
        }

        /* User Management */
        .user-management {
          background: white;
          padding: 2rem;
          border-radius: 1rem;
          border: 1px solid #e2e8f0;
        }

        .management-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .add-btn {
          background: #6366f1;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          border: none;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          cursor: pointer;
        }

        .admin-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .admin-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: #f8fafc;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
        }

        .admin-item span {
          font-weight: 600;
        }

        .admin-item button {
          color: #ef4444;
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .back-btn {
          color: #64748b;
          background: transparent;
          border: none;
          cursor: pointer;
          font-weight: 600;
        }

        .is-mapped { border-top: 4px solid #10b981; }
        .is-unmapped { border-top: 4px solid #f59e0b; }

        /* Automation Panel */
        .automation-panel {
          background: white;
          padding: 2rem;
          border-radius: 1rem;
          border: 1px solid #e2e8f0;
        }

        .panels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .ops-card {
          padding: 1.5rem;
          background: #f8fafc;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 1.5rem;
        }

        .ops-info h3 {
          font-size: 1.125rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: #0f172a;
        }

        .ops-info p {
          font-size: 0.875rem;
          color: #64748b;
          line-height: 1.5;
        }

        .ops-btn {
          width: 100%;
          padding: 0.75rem;
          background: #0f172a;
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          cursor: pointer;
          transition: 0.2s;
        }

        .ops-btn:hover:not(:disabled) {
          background: #1e293b;
          transform: translateY(-1px);
        }

        .ops-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .console-output {
          background: #1e293b;
          border-radius: 0.75rem;
          overflow: hidden;
        }

        .console-header {
          background: #0f172a;
          padding: 0.75rem 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #94a3b8;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .console-text {
          padding: 1.5rem;
          color: #34d399;
          font-family: 'Fira Code', 'Courier New', monospace;
          font-size: 0.8125rem;
          line-height: 1.6;
          max-height: 400px;
          overflow-y: auto;
          margin: 0;
          white-space: pre-wrap;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
};

export default AdminPortal;
