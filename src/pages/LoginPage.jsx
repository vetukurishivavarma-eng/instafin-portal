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

  // Mouse & Tactile Knife States
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [isChopping, setIsChopping] = useState(false);

  // 3-State Evasive Lion States
  const [lionPos, setLionPos] = useState({ x: 120, y: 320 });
  const [isScared, setIsScared] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [isGrowling, setIsGrowling] = useState(false);
  const [actualSpeed, setActualSpeed] = useState(0);

  // Mutable refs for high-efficiency animation frame physics loop
  const lionPosRef = useRef({ x: 120, y: 320 });
  const lionVelRef = useRef({ x: 0, y: 0 });
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
      mod.frequency.setValueAtTime(26, now); // Low feline rumble beat
      modGain.gain.setValueAtTime(32, now);  // Growl pitch depth

      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.65);

      mod.connect(modGain);
      modGain.connect(osc.frequency);

      // Volume envelope swelling growl
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.75, now + 0.12);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.75);

      // Throaty low pass sweeping filter
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(350, now);
      filter.frequency.exponentialRampToValueAtTime(130, now + 0.6);

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      mod.start(now);
      osc.start(now);

      mod.stop(now + 0.8);
      osc.stop(now + 0.8);
    } catch (e) {
      console.warn('Audio Synthesis growl blocked or unsupported.', e);
    }
  };

  // Continuous Evasive 3-State Physics Loop
  useEffect(() => {
    let animationFrameId;

    const updatePhysics = () => {
      const mouse = mousePosRef.current;
      const pos = lionPosRef.current;
      const vel = lionVelRef.current;

      // Center of Lion is roughly X + 75, Y + 50
      const dx = pos.x + 75 - mouse.x;
      const dy = pos.y + 50 - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      let targetVelX = 0;
      let targetVelY = 0;
      let scared = false;

      // ==========================================
      // ADVANCED 3-STATE BEHAVIOR AI
      // ==========================================
      if (dist < 150) {
        // STATE 1: PANIC ESCAPE (Knife is extremely close!)
        scared = true;

        // Escape vector directly away from the Knife
        const forceX = dx / dist;
        const forceY = dy / dist;

        // Natural, controlled majestic sprint speed (capped at 3.0px/frame)
        targetVelX = forceX * 3.0;
        targetVelY = forceY * 3.0;

        // Trigger growl sound if knife is dangerously close (Danger/Cornered < 80px)
        if (dist < 80) {
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
      } else if (dist >= 150 && dist <= 280) {
        // STATE 2: IDLE WATCH (Knife is at a safe, curious distance)
        // Lion decelerates to a complete stop, stands, and breathes
        targetVelX = 0;
        targetVelY = 0;
        scared = false;
      } else {
        // STATE 3: CURIOUS FOLLOW (Knife is far away)
        // Lion walks slowly and majestically towards the Knife
        const followX = -dx / dist;
        const followY = -dy / dist;

        targetVelX = followX * 1.1; // Gentle walk
        targetVelY = followY * 1.1;
        scared = false;
      }

      // Smooth physics linear interpolation for velocity
      const nextVx = vel.x + (targetVelX - vel.x) * 0.12;
      const nextVy = vel.y + (targetVelY - vel.y) * 0.12;

      let nextX = pos.x + nextVx;
      let nextY = pos.y + nextVy;

      // Strictly enforce page/viewport boundaries
      const padding = 20;
      const minX = padding;
      const maxX = window.innerWidth - 170 - padding;
      const minY = padding + 90; // Avoid navbar overlap
      const maxY = window.innerHeight - 120 - padding;

      if (nextX < minX) {
        nextX = minX;
        targetVelX = Math.abs(nextVx) * 0.8; // Bounce back
      } else if (nextX > maxX) {
        nextX = maxX;
        targetVelX = -Math.abs(nextVx) * 0.8;
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

      const speed = Math.sqrt(nextVx * nextVx + nextVy * nextVy);

      setLionPos({ x: nextX, y: nextY });
      setIsScared(scared);
      setActualSpeed(speed);

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

  // Walking class trigger: true if moving, false if idle
  const isWalking = actualSpeed > 0.22;

  return (
    <div className="landing">
      {/* 3D GRADIENT DEFS FOR LION AND KNIFE (Zero external asset dependency) */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          {/* Majestic Golden Body Gradient */}
          <linearGradient id="lionBodyGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FBBF24" /> {/* Golden yellow highlight */}
            <stop offset="55%" stopColor="#F59E0B" /> {/* Amber mid-tone */}
            <stop offset="100%" stopColor="#D97706" /> {/* Ochre shadow */}
          </linearGradient>

          {/* Leg Depth Shadow Gradient */}
          <linearGradient id="lionLegShadowGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>

          {/* Chest & Mane bobbing Gradients */}
          <radialGradient id="lionManeGrad" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#78350F" />
            <stop offset="70%" stopColor="#451A03" />
            <stop offset="100%" stopColor="#1A0500" />
          </radialGradient>
          
          <radialGradient id="lionManeDarkGrad" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#451A03" />
            <stop offset="100%" stopColor="#1A0500" />
          </radialGradient>

          <linearGradient id="lionManeLightGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#451A03" />
          </linearGradient>

          {/* Snout Gradient */}
          <linearGradient id="snoutGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="100%" stopColor="#FDE68A" />
          </linearGradient>

          {/* Knife Handle (Carbon Fiber Ergonomic) */}
          <linearGradient id="knifeHandleGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#374151" />
            <stop offset="50%" stopColor="#1F2937" />
            <stop offset="100%" stopColor="#111827" />
          </linearGradient>

          {/* Knife Guard (Brass/Bronze) */}
          <linearGradient id="knifeGuardGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>

          {/* Knife Blade Steel Gradients */}
          <linearGradient id="knifeBladeFlatGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#F9FAFB" />
            <stop offset="50%" stopColor="#E5E7EB" />
            <stop offset="100%" stopColor="#9CA3AF" />
          </linearGradient>
          
          <linearGradient id="knifeBladeBevelGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#9CA3AF" />
            <stop offset="70%" stopColor="#4B5563" />
            <stop offset="100%" stopColor="#1F2937" />
          </linearGradient>
        </defs>
      </svg>

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

      {/* FREELY ROAMING INTERACTIVE 3D LION WITH SEAMLESSLY ATTACHED JOINTS */}
      <div 
        className={`lion-box ${isWalking ? 'walking' : ''} ${isScared ? 'scared' : ''}`}
        style={{
          transform: `translate(${lionPos.x}px, ${lionPos.y}px) scaleX(${facingLeft ? -1 : 1})`,
          '--swing-speed': isScared ? '0.12s' : '0.45s'
        }}
      >
        <div className="lion-svg-container">
          {isGrowling && <div className="lion-speech-bubble">Roarrr! 🦁🐾</div>}
          
          <svg width="150" height="110" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
            {/* Blurred Floor Shadow to ground the 3D model */}
            <ellipse cx="60" cy="98" rx="44" ry="4.5" fill="#000000" opacity="0.35" filter="blur(2px)" />

            {/* Tail (Waving, wiggles faster when scared) */}
            <g className="lion-tail">
              <path d="M 33,52 C 18,52 8,72 5,88" stroke="url(#lionLegShadowGrad)" strokeWidth="4.5" fill="none" strokeLinecap="round" />
              {/* Fluffy tail tuft */}
              <ellipse cx="4" cy="90" rx="6" ry="8" fill="#4a2c02" />
            </g>

            {/* Rear Left Leg (Rigged into hip skeleton, darker shadow color) */}
            <g className="lion-leg lion-leg-bl">
              <path d="M 24,55 Q 32,50 38,62 L 32,92 Q 28,95 24,92 Z" fill="url(#lionLegShadowGrad)" />
              <ellipse cx="28" cy="92" rx="7" ry="4" fill="#78350F" />
            </g>

            {/* Rear Right Leg (Rigged into hip skeleton, darker shadow color) */}
            <g className="lion-leg lion-leg-br">
              <path d="M 40,55 Q 48,50 54,62 L 48,92 Q 44,95 40,92 Z" fill="url(#lionLegShadowGrad)" />
              <ellipse cx="44" cy="92" rx="7" ry="4" fill="#78350F" />
            </g>

            {/* Main Torso (overlapping rear legs) */}
            <path d="M 28,52 Q 65,34 98,48 Q 98,72 65,70 Q 28,70 28,52 Z" fill="url(#lionBodyGrad)" />
            
            {/* 3D Muscle Shoulder & Hip Contours (Attached structure) */}
            <path d="M 82,48 Q 90,56 82,68" stroke="#D97706" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
            <path d="M 32,50 Q 26,58 32,68" stroke="#D97706" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />

            {/* Chest contour (Breathing animation) */}
            <ellipse cx="85" cy="53" rx="20" ry="20" fill="url(#lionBodyGrad)" className="lion-chest" />

            {/* Front Left Leg (Rigged into chest/shoulder joints, primary golden color) */}
            <g className="lion-leg lion-leg-fl">
              <path d="M 48,56 Q 56,52 62,64 L 56,94 Q 52,97 48,94 Z" fill="url(#lionBodyGrad)" />
              <ellipse cx="52" cy="94" rx="7" ry="4" fill="#B45309" />
            </g>

            {/* Front Right Leg (Rigged into chest/shoulder joints, primary golden color) */}
            <g className="lion-leg lion-leg-fr">
              <path d="M 65,56 Q 73,52 78,64 L 72,94 Q 68,97 64,94 Z" fill="url(#lionBodyGrad)" />
              <ellipse cx="68" cy="94" rx="7" ry="4" fill="#B45309" />
            </g>

            {/* Floating Head & Majestic Mane (Bobs up/down) */}
            <g className="lion-mane">
              {/* Volumetric layered 3D mane */}
              <circle cx="104" cy="40" r="26" fill="url(#lionManeGrad)" />
              <circle cx="112" cy="48" r="18" fill="url(#lionManeDarkGrad)" />
              <circle cx="94" cy="34" r="20" fill="url(#lionManeLightGrad)" />
              
              {/* Left and Right Ears peeking out with 3D shadow depth */}
              <circle cx="97" cy="22" r="6" fill="url(#lionBodyGrad)" />
              <circle cx="97" cy="22" r="3.5" fill="#451A03" />
              <circle cx="114" cy="24" r="6" fill="url(#lionBodyGrad)" />
              <circle cx="114" cy="24" r="3.5" fill="#451A03" />
              
              {/* Head face base */}
              <circle cx="106" cy="42" r="17" fill="url(#lionBodyGrad)" />
              
              {/* 3D Snout */}
              <ellipse cx="112" cy="48" rx="8" ry="6" fill="url(#snoutGrad)" />
              {/* Feline nose */}
              <polygon points="113,44 117,44 115,47" fill="#1A0500" />

              {/* Eyes (Closed in fear > < when scared, yellow open wild when safe) */}
              {isScared ? (
                <g>
                  {/* Left Eye closed */}
                  <path d="M 97,39 L 101,42 L 97,45" stroke="#1A0500" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  {/* Right Eye closed */}
                  <path d="M 108,39 L 104,42 L 108,45" stroke="#1A0500" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </g>
              ) : (
                <g>
                  {/* Left open eye */}
                  <circle cx="99" cy="40" r="3.5" fill="#FBBF24" />
                  <circle cx="99" cy="40" r="1.5" fill="#000" />
                  <circle cx="99.5" cy="39.2" r="0.6" fill="white" />
                  
                  {/* Right open eye */}
                  <circle cx="107" cy="40" r="3.5" fill="#FBBF24" />
                  <circle cx="107" cy="40" r="1.5" fill="#000" />
                  <circle cx="107.5" cy="39.2" r="0.6" fill="white" />
                </g>
              )}

              {/* Whiskers */}
              <path d="M 114,48 L 122,47 M 114,49 L 121,50 M 114,50 L 120,53" stroke="#451A03" strokeWidth="0.8" />
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

      {/* DYNAMIC 3D HIGH-FIDELITY COMBAT KNIFE CURSOR */}
      <div 
        className={`custom-axe-cursor ${isChopping ? 'chopping' : ''}`}
        style={{
          left: `${mouseX}px`,
          top: `${mouseY}px`
        }}
      >
        <svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
          {/* Handle (Dark Ergonomic Carbon Fiber texture) */}
          <rect x="5" y="34" width="5.5" height="15.5" rx="1.5" transform="rotate(-45 5 34)" fill="url(#knifeHandleGrad)" stroke="#111827" strokeWidth="0.8" />
          {/* Steel Rivets on Handle */}
          <circle cx="9" cy="38" r="0.75" fill="#E5E7EB" />
          <circle cx="14" cy="33" r="0.75" fill="#E5E7EB" />
          
          {/* Gold Hilt Guard */}
          <rect x="15" y="24" width="8.5" height="3" rx="1" transform="rotate(-45 15 24)" fill="url(#knifeGuardGrad)" stroke="#78350F" strokeWidth="0.5" />
          
          {/* 3D Beveled Knife Blade Steel */}
          {/* Lower Blade Bevel (Silver-gray steel) */}
          <path d="M 19,20 L 38,1 L 39,2 L 22,23 Z" fill="url(#knifeBladeFlatGrad)" />
          {/* Upper Blade Bevel (Dark carbon steel) */}
          <path d="M 19,20 L 38,1 L 34,12 L 22,23 Z" fill="url(#knifeBladeBevelGrad)" />
          {/* Specular Edge Line (Shiny white highlight) */}
          <path d="M 22,23 L 39,2 Q 40,0 38,1 Z" fill="#FFFFFF" opacity="0.9" />
        </svg>
      </div>
    </div>
  );
}