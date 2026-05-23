import React, { useState, useEffect, useRef } from 'react';
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

  // Mouse & Tactile Axe States
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [isChopping, setIsChopping] = useState(false);

  // Evasive Lion States
  const [lionPos, setLionPos] = useState({ x: 120, y: 320 });
  const [isScared, setIsScared] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [isGrowling, setIsGrowling] = useState(false);

  // Mutable refs for high-efficiency animation frame physics loop
  const lionPosRef = useRef({ x: 120, y: 320 });
  const lionVelRef = useRef({ x: 1.2, y: 0.4 });
  const mousePosRef = useRef({ x: 0, y: 0 });
  const lastRoarTimeRef = useRef(0);

  // Track cursor coordinates globally inside the page
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseDown = () => {
      setIsChopping(true);
    };

    const handleMouseUp = () => {
      setIsChopping(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Web Audio API throaty Feline Growl Synthesizer
  const synthesizeGrowl = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      mod.type = 'sine';

      const now = ctx.currentTime;

      // FM Pitch Rumble modulation
      mod.frequency.setValueAtTime(28, now); // LFO rumble beat
      modGain.gain.setValueAtTime(32, now);  // Growl pitch depth

      osc.frequency.setValueAtTime(68, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.6);

      mod.connect(modGain);
      modGain.connect(osc.frequency);

      // Volume envelope swelling growl
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.7, now + 0.12);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

      // Throaty low pass sweeping filter
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.6);

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      mod.start(now);
      osc.start(now);

      mod.stop(now + 0.75);
      osc.stop(now + 0.75);
    } catch (e) {
      console.warn('Audio Synthesis is disabled or blocked by browser settings.', e);
    }
  };

  // Continuous Evasive 2D Physics Loop
  useEffect(() => {
    let animationFrameId;

    const updatePhysics = () => {
      const mouse = mousePosRef.current;
      const pos = lionPosRef.current;
      const vel = lionVelRef.current;

      // Center of Lion is X + 75, Y + 50
      const dx = pos.x + 75 - mouse.x;
      const dy = pos.y + 50 - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      let targetVelX = vel.x;
      let targetVelY = vel.y;
      let scared = false;

      // Evasion trigger threshold (Axe comes near)
      if (dist < 220) {
        scared = true;

        // Escape vector directly away from the Axe
        const forceX = dx / dist;
        const forceY = dy / dist;

        // Evasive running speeds
        targetVelX = forceX * 7.5;
        targetVelY = forceY * 7.5;

        // Trigger rumbling growl if axe is extremely close (Danger/Cornered)
        if (dist < 85) {
          const now = Date.now();
          if (now - lastRoarTimeRef.current > 1500) {
            synthesizeGrowl();
            lastRoarTimeRef.current = now;
            
            // Trigger visual growl warning
            setIsGrowling(true);
            setTimeout(() => {
              setIsGrowling(false);
            }, 1000);
          }
        }
      } else {
        // Safe wandering drift pattern
        targetVelX = vel.x * 0.95 + (Math.random() - 0.5) * 0.2;
        targetVelY = vel.y * 0.95 + (Math.random() - 0.5) * 0.2;

        // Slow calm wander speed clamp
        const speed = Math.sqrt(targetVelX * targetVelX + targetVelY * targetVelY) || 1;
        if (speed > 1.3) {
          targetVelX = (targetVelX / speed) * 1.3;
          targetVelY = (targetVelY / speed) * 1.3;
        }
      }

      // Smooth physics linear interpolation for velocity
      const nextVx = vel.x + (targetVelX - vel.x) * 0.12;
      const nextVy = vel.y + (targetVelY - vel.y) * 0.12;

      let nextX = pos.x + nextVx;
      let nextY = pos.y + nextVy;

      // Strictly enforce page/viewport boundaries (strictly bounded!)
      const padding = 20;
      const minX = padding;
      const maxX = window.innerWidth - 170 - padding;
      const minY = padding + 90; // Avoid navbar overlap
      const maxY = window.innerHeight - 120 - padding;

      if (nextX < minX) {
        nextX = minX;
        targetVelX = Math.abs(nextVx) * 0.8; // Bounce
      } else if (nextX > maxX) {
        nextX = maxX;
        targetVelX = -Math.abs(nextVx) * 0.8; // Bounce
      }

      if (nextY < minY) {
        nextY = minY;
        targetVelY = Math.abs(nextVy) * 0.8;
      } else if (nextY > maxY) {
        nextY = maxY;
        targetVelY = -Math.abs(nextVy) * 0.8;
      }

      // Write updates to Refs & States
      lionPosRef.current = { x: nextX, y: nextY };
      lionVelRef.current = { x: nextVx, y: nextVy };

      setLionPos({ x: nextX, y: nextY });
      setIsScared(scared);

      // Horizontal orientation flip to face its heading direction
      if (nextVx < -0.15) {
        setFacingLeft(true);
      } else if (nextVx > 0.15) {
        setFacingLeft(false);
      }

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    animationFrameId = requestAnimationFrame(updatePhysics);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

      {/* FREELY ROAMING INTERACTIVE LION (Pulsing mesh background shadow) */}
      <div 
        className={`lion-box walking ${isScared ? 'scared' : ''}`}
        style={{
          transform: `translate(${lionPos.x}px, ${lionPos.y}px) scaleX(${facingLeft ? -1 : 1})`,
          '--swing-speed': isScared ? '0.12s' : '0.45s'
        }}
      >
        <div className="lion-svg-container">
          {isGrowling && <div className="lion-speech-bubble">Roarrr! 🦁🐾</div>}
          
          <svg width="150" height="100" viewBox="0 0 150 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
            {/* Tail (Waving, wiggles faster when scared) */}
            <g className="lion-tail">
              <path d="M 33,52 C 18,52 8,72 5,88" stroke="#e5a93b" strokeWidth="4.5" fill="none" strokeLinecap="round" />
              {/* Fluffy tail tuft */}
              <ellipse cx="4" cy="90" rx="6" ry="8" fill="#4a2c02" />
            </g>

            {/* Rear Left Leg (Depth dark shadow color) */}
            <g className="lion-leg lion-leg-bl">
              <rect x="20" y="62" width="10" height="24" rx="5" fill="#a05f25" />
              <ellipse cx="25" cy="86" rx="7" ry="5" fill="#7d4512" />
            </g>

            {/* Rear Right Leg (Depth dark shadow color) */}
            <g className="lion-leg lion-leg-br">
              <rect x="35" y="62" width="10" height="24" rx="5" fill="#a05f25" />
              <ellipse cx="40" cy="86" rx="7" ry="5" fill="#7d4512" />
            </g>

            {/* Back Body */}
            <ellipse cx="65" cy="55" rx="36" ry="18" fill="#e5a93b" />

            {/* Chest contour (Breathing animation) */}
            <ellipse cx="85" cy="50" rx="20" ry="22" fill="#dfa010" className="lion-chest" />

            {/* Front Left Leg */}
            <g className="lion-leg lion-leg-fl">
              <rect x="50" y="62" width="11" height="24" rx="5.5" fill="#e5a93b" />
              <ellipse cx="55" cy="86" rx="8" ry="5.5" fill="#BF7735" />
            </g>

            {/* Front Right Leg */}
            <g className="lion-leg lion-leg-fr">
              <rect x="65" y="62" width="11" height="24" rx="5.5" fill="#e5a93b" />
              <ellipse cx="70" cy="86" rx="8" ry="5.5" fill="#BF7735" />
            </g>

            {/* Floating Head & Majestic Mane (Bobs up/down) */}
            <g className="lion-mane">
              {/* Lush thick mane */}
              <circle cx="105" cy="40" r="26" fill="#5c3a21" />
              <circle cx="112" cy="50" r="18" fill="#4a2c02" />
              <circle cx="95" cy="35" r="20" fill="#6d472c" />
              
              {/* Left and Right Ears peeking out */}
              <circle cx="98" cy="22" r="6" fill="#e5a93b" />
              <circle cx="98" cy="22" r="3.5" fill="#4a2c02" />
              <circle cx="115" cy="24" r="6" fill="#e5a93b" />
              <circle cx="115" cy="24" r="3.5" fill="#4a2c02" />
              
              {/* Head face base */}
              <circle cx="106" cy="42" r="17" fill="#e5a93b" />
              
              {/* Snout */}
              <ellipse cx="112" cy="48" rx="8" ry="6" fill="#fcdba2" />
              {/* Feline nose */}
              <polygon points="113,44 117,44 115,47" fill="#4a2c02" />

              {/* Eyes (Closed in fear > < when scared, yellow open wild when safe) */}
              {isScared ? (
                <g>
                  {/* Left Eye closed */}
                  <path d="M 97,39 L 101,42 L 97,45" stroke="#3D1D00" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  {/* Right Eye closed */}
                  <path d="M 108,39 L 104,42 L 108,45" stroke="#3D1D00" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </g>
              ) : (
                <g>
                  {/* Left open eye */}
                  <circle cx="99" cy="40" r="3.5" fill="#ffd700" />
                  <circle cx="99" cy="40" r="1.5" fill="#000" />
                  
                  {/* Right open eye */}
                  <circle cx="107" cy="40" r="3.5" fill="#ffd700" />
                  <circle cx="107" cy="40" r="1.5" fill="#000" />
                </g>
              )}

              {/* Whiskers */}
              <path d="M 114,48 L 122,47 M 114,49 L 121,50 M 114,50 L 120,53" stroke="#4a2c02" strokeWidth="0.8" />
            </g>
          </svg>
        </div>
      </div>

      <div className="landing-content" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal" style={{ maxWidth: '420px', width: '90%' }}>
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
                required
              />
            </div>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
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

      {/* CUSTOM INTERACTIVE AXE CURSOR (Tracks mouse coordinate position) */}
      <div 
        className={`custom-axe-cursor ${isChopping ? 'chopping' : ''}`}
        style={{
          left: `${mouseX}px`,
          top: `${mouseY}px`
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
          {/* Wooden handle */}
          <rect x="4" y="30" width="4.5" height="28" rx="1.5" transform="rotate(-45 4 30)" fill="#8B5A2B" stroke="#4A2C02" strokeWidth="0.8" />
          {/* Leather grip details */}
          <line x1="16" y1="18" x2="20" y2="14" stroke="#3D1D00" strokeWidth="1" />
          <line x1="19" y1="21" x2="23" y2="17" stroke="#3D1D00" strokeWidth="1" />
          {/* Shiny Steel Axe Blade */}
          <path d="M 23,12 C 27,8 35,6 37,9 C 39,12 37,19 32,23 C 28,25 24,24 21,21" fill="#B0C4DE" stroke="#4A6572" strokeWidth="1.2" />
          {/* Blade sharp edge highlight */}
          <path d="M 33,10 C 35,11 35,15 31,18" stroke="white" strokeWidth="1" strokeLinecap="round" />
          {/* Heavy iron backing hammer block */}
          <rect x="18" y="9" width="6.5" height="7.5" rx="1" transform="rotate(-45 18 9)" fill="#708090" stroke="#3F4E56" strokeWidth="0.8" />
        </svg>
      </div>
    </div>
  );
}