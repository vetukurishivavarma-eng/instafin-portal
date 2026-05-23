import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LandingPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Interactive Puppy States
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isBarking, setIsBarking] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Walk-in entry animation timing on mount
  useEffect(() => {
    setIsWalking(true);
    
    const enterTimer = setTimeout(() => {
      setHasEntered(true);
      setIsWalking(false);
    }, 1400); // 1.4s matching the CSS walking animation keyframe duration

    return () => {
      clearTimeout(enterTimer);
    };
  }, []);

  // Mouse coordinate tracking for the Puppy Gaze & Head Tilt
  useEffect(() => {
    const handleMouseMove = (e) => {
      // Estimate the physical location of the puppy on screen (center-top of the login card)
      const puppyX = window.innerWidth / 2;
      const puppyY = window.innerHeight / 2 - 120; // Offset above vertical screen center
      
      const dx = e.clientX - puppyX;
      const dy = e.clientY - puppyY;
      
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const maxDistance = 450; // Limit cursor reaction radius
      const limit = Math.min(distance, maxDistance);
      
      // Maximum offsets in pixels
      const lookLimitX = 5.5; // pupil horizontal movement range
      const lookLimitY = 4.0; // pupil vertical movement range
      
      const xOffset = (dx / distance) * (limit / maxDistance) * lookLimitX;
      const yOffset = (dy / distance) * (limit / maxDistance) * lookLimitY;
      
      setMousePos({ x: xOffset, y: yOffset });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Web Audio API Puppy Bark Synthesizer
  const synthesizeBark = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // First Bark ("Woof!")
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';

      const now = ctx.currentTime;

      // Descending pitch envelope
      osc1.frequency.setValueAtTime(300, now);
      osc1.frequency.exponentialRampToValueAtTime(110, now + 0.15);

      osc2.frequency.setValueAtTime(150, now);
      osc2.frequency.exponentialRampToValueAtTime(60, now + 0.15);

      // Volume envelope
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.8, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      // Sweeping Lowpass filter
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.18);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);

      // Second Bark (Short Echo "Woof!")
      setTimeout(() => {
        const ctx2 = new AudioContext();
        const osc1_2 = ctx2.createOscillator();
        const osc2_2 = ctx2.createOscillator();
        const gainNode_2 = ctx2.createGain();
        const filter_2 = ctx2.createBiquadFilter();

        osc1_2.type = 'sawtooth';
        osc2_2.type = 'triangle';

        const now2 = ctx2.currentTime;
        osc1_2.frequency.setValueAtTime(320, now2);
        osc1_2.frequency.exponentialRampToValueAtTime(120, now2 + 0.12);

        osc2_2.frequency.setValueAtTime(160, now2);
        osc2_2.frequency.exponentialRampToValueAtTime(65, now2 + 0.12);

        gainNode_2.gain.setValueAtTime(0, now2);
        gainNode_2.gain.linearRampToValueAtTime(0.6, now2 + 0.02);
        gainNode_2.gain.exponentialRampToValueAtTime(0.01, now2 + 0.2);

        filter_2.type = 'lowpass';
        filter_2.frequency.setValueAtTime(1000, now2);
        filter_2.frequency.exponentialRampToValueAtTime(280, now2 + 0.15);

        osc1_2.connect(filter_2);
        osc2_2.connect(filter_2);
        filter_2.connect(gainNode_2);
        gainNode_2.connect(ctx2.destination);

        osc1_2.start(now2);
        osc2_2.start(now2);
        osc1_2.stop(now2 + 0.25);
        osc2_2.stop(now2 + 0.25);
      }, 140);

    } catch (err) {
      console.warn('Audio Synthesis is muted or unsupported in this browser.', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Trigger visual barking and audio synthesis
    setIsBarking(true);
    synthesizeBark();
    setLoading(true);

    // Keep state active for 1.2s to showcase the animation
    setTimeout(async () => {
      try {
        await login(email, password);
        navigate('/dashboard');
      } catch (err) {
        setError(err.message || 'Login failed. Please try again.');
        setIsBarking(false);
        setLoading(false);
      }
    }, 1200);
  };

  // Pupil translations (follow cursor)
  const lookX = isPasswordFocused ? 0 : mousePos.x;
  const lookY = isPasswordFocused ? 0 : mousePos.y;
  
  // Head tilt translations (slightly smaller scale for realistic 3D perspective effect)
  const headX = isPasswordFocused ? 0 : mousePos.x * 0.4;
  const headY = isPasswordFocused ? 0 : mousePos.y * 0.45;

  return (
    <div className="landing">
      <div className="floating-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
      </div>

      <nav className="landing-nav">
        <div className="logo" onClick={() => navigate('/')}>
          <div className="logo-icon">IF</div>
          <span className="logo-text">InstaFin</span>
        </div>
        <div className="nav-actions">
          <Link to="/" className="btn-login">Home</Link>
        </div>
      </nav>

      <div className="landing-content" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal" style={{ maxWidth: '420px', width: '90%' }}>
          
          {/* THE INTERACTIVE PUPPY */}
          <div className="puppy-box">
            <div className={`puppy-svg-container ${isWalking ? 'walking' : ''} ${hasEntered ? 'entered' : ''}`}>
              {isBarking && <div className="puppy-speech-bubble">Woof! 🐾</div>}
              
              <svg width="110" height="110" viewBox="0 0 110 110" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
                {/* Tail */}
                <g className={`puppy-tail ${isBarking ? 'excited' : ''}`}>
                  <path d="M 32,88 Q 15,75 10,85 Q 12,95 28,92 Z" fill="#BF7735" />
                  <path d="M 10,85 Q 8,82 12,81 Q 15,83 13,87 Z" fill="#FCE1BE" />
                </g>

                {/* Back Body */}
                <ellipse cx="55" cy="88" rx="28" ry="18" fill="#E69C54" />

                {/* Head Base */}
                <circle cx="55" cy="55" r="30" fill="#E69C54" />
                <path d="M 38,40 Q 55,25 72,40 Z" fill="#E69C54" />

                {/* FLOATING FACE ELEMENTS (Follows mouse cursor with 3D depth) */}
                <g style={{ transform: `translate(${headX}px, ${headY}px)`, transition: 'transform 0.12s ease-out' }}>
                  {/* Face Patch (Cream) */}
                  <ellipse cx="55" cy="62" rx="19" ry="13" fill="#FCE1BE" />

                  {/* Snout */}
                  <ellipse cx="55" cy="66" rx="11" ry="8" fill="#FAD19E" />
                  
                  {/* Nose */}
                  <polygon points="52,62 58,62 55,65" fill="#3D1D00" />

                  {/* Mouth & Tongue */}
                  {isBarking ? (
                    <g>
                      {/* Open Mouth */}
                      <ellipse cx="55" cy="72" rx="5" ry="6" fill="#3D1D00" />
                      {/* Tongue */}
                      <path d="M 52,73 Q 55,80 58,73 Z" fill="#FF8B94" />
                    </g>
                  ) : (
                    /* Standard Smile */
                    <path d="M 51,66 Q 55,69 59,66" stroke="#3D1D00" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  )}

                  {/* Eyes */}
                  {isPasswordFocused ? (
                    <g>
                      {/* Shy Closed Eyes ^ ^ */}
                      <path d="M 37,50 Q 43,44 49,50" stroke="#3D1D00" strokeWidth="3" strokeLinecap="round" fill="none" />
                      <path d="M 61,50 Q 67,44 73,50" stroke="#3D1D00" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </g>
                  ) : (
                    <g>
                      {/* White backgrounds */}
                      <circle cx="43" cy="48" r="7.5" fill="white" />
                      <circle cx="67" cy="48" r="7.5" fill="white" />
                      
                      {/* Pupils that trace the cursor */}
                      <g className="puppy-pupil" style={{ transform: `translate(${lookX}px, ${lookY}px)`, transition: 'transform 0.08s ease-out' }}>
                        <circle cx="43" cy="48" r="4.5" fill="#3D1D00" />
                        <circle cx="67" cy="48" r="4.5" fill="#3D1D00" />
                        
                        {/* Eye Sparkles */}
                        <circle cx="41.2" cy="46.2" r="1.5" fill="white" />
                        <circle cx="65.2" cy="46.2" r="1.5" fill="white" />
                      </g>
                    </g>
                  )}

                  {/* Cheek Blush */}
                  <circle cx="33" cy="57" r="3" fill="#FF8B94" opacity="0.5" />
                  <circle cx="77" cy="57" r="3" fill="#FF8B94" opacity="0.5" />
                </g>

                {/* Floppy Ears (Remain anchored for structure) */}
                <g className={`puppy-ear ${isPasswordFocused ? 'hide-pass' : ''}`} style={{ transformOrigin: '27px 38px' }}>
                  <path d="M 27,38 C 15,38 12,65 24,70 C 30,71 33,52 27,38 Z" fill="#BF7735" />
                </g>
                <g className={`puppy-ear ${isPasswordFocused ? 'hide-pass' : ''}`} style={{ transformOrigin: '83px 38px' }}>
                  <path d="M 83,38 C 95,38 98,65 86,70 C 80,71 77,52 83,38 Z" fill="#BF7735" />
                </g>

                {/* Raised Paws (Covers eyes when password is focused) */}
                <g className={`puppy-paw puppy-paw-left ${isPasswordFocused ? 'hide-pass' : ''}`} style={{ transformOrigin: '40px 96px' }}>
                  <ellipse cx="40" cy="96" rx="9" ry="8" fill="#FCE1BE" stroke="#BF7735" strokeWidth="1.2" />
                  <circle cx="36" cy="92" r="1" fill="#BF7735" />
                  <circle cx="40" cy="91" r="1" fill="#BF7735" />
                  <circle cx="44" cy="92" r="1" fill="#BF7735" />
                </g>
                <g className={`puppy-paw puppy-paw-right ${isPasswordFocused ? 'hide-pass' : ''}`} style={{ transformOrigin: '70px 96px' }}>
                  <ellipse cx="70" cy="96" rx="9" ry="8" fill="#FCE1BE" stroke="#BF7735" strokeWidth="1.2" />
                  <circle cx="66" cy="92" r="1" fill="#BF7735" />
                  <circle cx="70" cy="91" r="1" fill="#BF7735" />
                  <circle cx="74" cy="92" r="1" fill="#BF7735" />
                </g>
              </svg>
            </div>
          </div>

          <h2>Welcome Back</h2>
          <p className="modal-subtitle">Sign in to access your dashboard</p>

          {error && (
            <div className="error-message" style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setIsPasswordFocused(true)}
                onBlur={() => setIsPasswordFocused(false)}
                required
              />
            </div>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading && isBarking ? 'Woof! 🐾' : loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{
            marginTop: '1.5rem',
            padding: '1.25rem',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: '600' }}>Demo Accounts:</p>
            <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', margin: '0.25rem 0' }}>admin@instafin.com / admin123</p>
            <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', margin: '0.25rem 0' }}>exec@instafin.com / exec123</p>
            <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', margin: '0.25rem 0' }}>dsa@instafin.com / dsa123</p>
          </div>

          <p style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '0.9rem'
          }}>
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/?action=signup')}
              style={{
                background: 'none',
                border: 'none',
                color: '#6366f1',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.color = '#a855f7'}
              onMouseLeave={(e) => e.target.style.color = '#6366f1'}
            >
              Request Access
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}