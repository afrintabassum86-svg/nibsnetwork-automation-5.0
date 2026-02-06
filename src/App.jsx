import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';

import AdminPortal from './AdminPortal';
import './index.css';

import { FaFacebookF, FaLinkedinIn, FaTiktok } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';

const Header = () => (
  <header className="header">
    <div className="profile-container">
      <div className="logo-box">
        <img
          src="/logo.png"
          alt="thenibsnetwork"
          className="brand-logo"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      </div>
      <h1 className="profile-title">thenibsnetwork</h1>
      <p className="profile-bio">
        Official Instagram Link In Bio of @thenibsnetwork.
      </p>

      <div className="social-links">
        <a href="https://facebook.com/nibsnetwork" target="_blank" rel="noreferrer" className="social-icon">
          <FaFacebookF />
        </a>
        <a href="https://twitter.com/nibsnetwork" target="_blank" rel="noreferrer" className="social-icon">
          <FaXTwitter />
        </a>
        <a href="https://linkedin.com/company/nibsnetwork" target="_blank" rel="noreferrer" className="social-icon">
          <FaLinkedinIn />
        </a>
        <a href="https://tiktok.com/@nibsnetwork" target="_blank" rel="noreferrer" className="social-icon">
          <FaTiktok />
        </a>
      </div>

      <a href="https://nibsnetwork.com/register/" target="_blank" rel="noreferrer" className="cta-banner">
        Sign Up For The Nibs Daily Newsletter
      </a>
    </div>
  </header>
);

const InstagramGrid = ({ posts, loading }) => (
  <section className="grid-section">
    <h2 className="section-label">INSTAGRAM POSTS</h2>

    {loading ? (
      <div className="loading-state">Loading latest posts...</div>
    ) : (
      <div className="instagram-grid">
        {posts.map((post) => (
          <a
            key={post.id}
            href={post.blog_url || post.url}
            className="grid-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="image-container">
              <img
                src={post.image}
                alt={post.title}
                loading="lazy"
              />
            </div>
            <div className="card-overlay">
              <span className="overlay-text">{post.blog_url ? 'Read Article' : 'View Post'}</span>
            </div>
          </a>
        ))}
      </div>
    )}
  </section>
);

const Footer = () => (
  <footer className="page-footer">
    <p>&copy; {new Date().getFullYear()} thenibsnetwork</p>
    <p className="attribution">Powered by thenibsnetwork</p>
  </footer>
);

const Home = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const response = await fetch(`${API_URL}/api/posts`);
        if (!response.ok) throw new Error('Failed to fetch posts');
        const data = await response.json();
        setPosts(data || []);
      } catch (err) {
        console.error('Error fetching posts:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, []);

  return (
    <div className="page-wrapper">
      <Header />
      <InstagramGrid posts={posts} loading={loading} />
      <Footer />
    </div>
  );
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<AdminPortal />} />
    </Routes>
  );
}

export default App;
