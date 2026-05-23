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

  // 3D Lion States
  const [isGrowling, setIsGrowling] = useState(false);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const lastRoarTimeRef = useRef(0);

  // Track window resizing for fixed background layout math
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Track cursor coordinates globally inside the page
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
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

  // Web Audio API throaty LOUD Feline Growl Synthesizer (Gain: 2.4!)
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
      mod.frequency.setValueAtTime(26, now); // Low rumble frequency
      modGain.gain.setValueAtTime(32, now);  // Growl pitch sway depth

      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.7);

      mod.connect(modGain);
      modGain.connect(osc.frequency);

      // Volume envelope swelling LOUD growl (Up to 2.4!)
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(2.4, now + 0.12);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

      // Throaty low pass sweeping filter
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, now);
      filter.frequency.exponentialRampToValueAtTime(125, now + 0.65);

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      mod.start(now);
      osc.start(now);

      mod.stop(now + 0.85);
      osc.stop(now + 0.85);
    } catch (e) {
      console.warn('Audio Synthesis growl blocked or unsupported.', e);
    }
  };

  // Fixed Lion position coordinates on screen background
  const lionFixedX = 80;
  const lionFixedY = windowHeight - 180;

  // Delta vector from Lion center to the mouse Knife cursor
  const dx = lionFixedX + 75 - mouseX;
  const dy = lionFixedY + 50 - mouseY;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  // Lion State Calculations
  const isScared = dist < 170;   // Squeezes eyes shut when knife is within 170px
  const facingLeft = dx > 0;     // Faces left if cursor is to the left of the lion, else right

  // Throttled growl trigger when knife gets too close
  useEffect(() => {
    if (isScared && dist < 95) {
      const now = Date.now();
      if (now - lastRoarTimeRef.current > 1800) {
        synthesizeGrowl();
        lastRoarTimeRef.current = now;
        
        setIsGrowling(true);
        const timer = setTimeout(() => {
          setIsGrowling(false);
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [isScared, dist]);

  // Gaze coordinates (Lion tracks Knife with its eyes and head)
  const lookLimitX = 6.0;
  const lookLimitY = 4.5;

  const nx = -dx / dist;
  const ny = -dy / dist;

  const lookX = isScared ? 0 : nx * lookLimitX;
  const lookY = isScared ? 0 : ny * lookLimitY;

  const headX = isScared ? 0 : nx * 2.5;
  const headY = isScared ? 0 : ny * 2.5;

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
    <div className="landing jungle-theme">
      {/* Interactive jungle background foliage overlays */}
      <div className="jungle-sunbeam"></div>
      <div className="jungle-vines"></div>
      <div className="jungle-leaves-left"></div>
      <div className="jungle-leaves-right"></div>
      {/* 3D GRADIENT DEFS FOR JUNGLE ANIMALS & KNIFE */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          {/* Majestic Golden Body Gradient */}
          <linearGradient id="lionBodyGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="55%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          {/* Leg Depth Shadow Gradient */}
          <linearGradient id="lionLegShadowGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>

          {/* Mane bobbing Gradients */}
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

          {/* 3D Elephant Gradients */}
          <linearGradient id="eleBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#64748B" />
            <stop offset="60%" stopColor="#475569" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <linearGradient id="eleEar" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>

          {/* 3D Monkey Gradients */}
          <linearGradient id="monkBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="60%" stopColor="#78350F" />
            <stop offset="100%" stopColor="#451A03" />
          </linearGradient>

          {/* 3D Bird Gradients */}
          <linearGradient id="cyanBird" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#0891B2" />
          </linearGradient>
          <linearGradient id="redBird" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="100%" stopColor="#BE123C" />
          </linearGradient>

          {/* 3D Giraffe Gradients */}
          <linearGradient id="girNeck" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="girHead" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="60%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>

          {/* 3D Panda Gradients */}
          <radialGradient id="pandaBody" cx="45%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="75%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </radialGradient>

          {/* 3D Sloth Gradients */}
          <linearGradient id="slothBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="60%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>

          {/* 3D Owl Gradients */}
          <linearGradient id="owlBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#78350F" />
            <stop offset="60%" stopColor="#451A03" />
            <stop offset="100%" stopColor="#1A0500" />
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

      {/* FREELY STANDING STATIONARY 3D LION (Turns/Looks at cursor dynamically) */}
      <div 
        className="lion-box"
        style={{
          position: 'fixed',
          left: '80px',
          bottom: '50px',
          transform: `scaleX(${facingLeft ? -1 : 1})`,
          zIndex: 4
        }}
      >
        <div className="lion-svg-container">
          {isGrowling && <div className="lion-speech-bubble">Roarrr! 🦁🐾</div>}
          
          <svg width="150" height="110" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
            {/* Blurred Floor Shadow */}
            <ellipse cx="60" cy="98" rx="44" ry="4.5" fill="#000000" opacity="0.35" filter="blur(2px)" />

            {/* Tail */}
            <g className="lion-tail">
              <path d="M 33,52 C 18,52 8,72 5,88" stroke="url(#lionLegShadowGrad)" strokeWidth="4.5" fill="none" strokeLinecap="round" />
              {/* Fluffy tail tuft */}
              <ellipse cx="4" cy="90" rx="6" ry="8" fill="#4a2c02" />
            </g>

            {/* Rear Left Leg */}
            <g className="lion-leg lion-leg-bl">
              <path d="M 24,55 Q 32,50 38,62 L 32,92 Q 28,95 24,92 Z" fill="url(#lionLegShadowGrad)" />
              <ellipse cx="28" cy="92" rx="7" ry="4" fill="#78350F" />
            </g>

            {/* Rear Right Leg */}
            <g className="lion-leg lion-leg-br">
              <path d="M 40,55 Q 48,50 54,62 L 48,92 Q 44,95 40,92 Z" fill="url(#lionLegShadowGrad)" />
              <ellipse cx="44" cy="92" rx="7" ry="4" fill="#78350F" />
            </g>

            {/* Main Torso */}
            <path d="M 28,52 Q 65,34 98,48 Q 98,72 65,70 Q 28,70 28,52 Z" fill="url(#lionBodyGrad)" />
            
            {/* 3D Muscle Contours */}
            <path d="M 82,48 Q 90,56 82,68" stroke="#D97706" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
            <path d="M 32,50 Q 26,58 32,68" stroke="#D97706" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />

            {/* Chest contour */}
            <ellipse cx="85" cy="53" rx="20" ry="20" fill="url(#lionBodyGrad)" className="lion-chest" />

            {/* Front Left Leg */}
            <g className="lion-leg lion-leg-fl">
              <path d="M 48,56 Q 56,52 62,64 L 56,94 Q 52,97 48,94 Z" fill="url(#lionBodyGrad)" />
              <ellipse cx="52" cy="94" rx="7" ry="4" fill="#B45309" />
            </g>

            {/* Front Right Leg */}
            <g className="lion-leg lion-leg-fr">
              <path d="M 65,56 Q 73,52 78,64 L 72,94 Q 68,97 64,94 Z" fill="url(#lionBodyGrad)" />
              <ellipse cx="68" cy="94" rx="7" ry="4" fill="#B45309" />
            </g>

            {/* Floating Head & Majestic Mane (Tracks mouse position with 3D Gaze) */}
            <g className="lion-mane">
              {/* Volumetric layered 3D mane */}
              <circle cx="104" cy="40" r="26" fill="url(#lionManeGrad)" />
              <circle cx="112" cy="48" r="18" fill="url(#lionManeDarkGrad)" />
              <circle cx="94" cy="34" r="20" fill="url(#lionManeLightGrad)" />
              
              {/* Left and Right Ears */}
              <circle cx="97" cy="22" r="6" fill="url(#lionBodyGrad)" />
              <circle cx="97" cy="22" r="3.5" fill="#451A03" />
              <circle cx="114" cy="24" r="6" fill="url(#lionBodyGrad)" />
              <circle cx="114" cy="24" r="3.5" fill="#451A03" />
              
              {/* Head face base */}
              <circle cx="106" cy="42" r="17" fill="url(#lionBodyGrad)" />

              {/* 3D FACE GROUP - Slides slightly to track cursor for 3D depth */}
              <g style={{ transform: `translate(${headX}px, ${headY}px)`, transition: 'transform 0.12s ease-out' }}>
                {/* 3D Snout */}
                <ellipse cx="112" cy="48" rx="8" ry="6" fill="url(#snoutGrad)" />
                {/* Feline nose */}
                <polygon points="113,44 117,44 115,47" fill="#1A0500" />

                {/* Eyes (Closed in fear > < when scared or password focused, yellow open wild when safe) */}
                {(isScared || isPasswordFocused) ? (
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
                    {/* pupil tracking */}
                    <g style={{ transform: `translate(${lookX}px, ${lookY}px)`, transition: 'transform 0.08s ease-out' }}>
                      <circle cx="99" cy="40" r="1.5" fill="#000" />
                      <circle cx="99.5" cy="39.2" r="0.6" fill="white" />
                    </g>
                    
                    {/* Right open eye */}
                    <circle cx="107" cy="40" r="3.5" fill="#FBBF24" />
                    <g style={{ transform: `translate(${lookX}px, ${lookY}px)`, transition: 'transform 0.08s ease-out' }}>
                      <circle cx="107" cy="40" r="1.5" fill="#000" />
                      <circle cx="107.5" cy="39.2" r="0.6" fill="white" />
                    </g>
                  </g>
                )}

                {/* Whiskers */}
                <path d="M 114,48 L 122,47 M 114,49 L 121,50 M 114,50 L 120,53" stroke="#451A03" strokeWidth="0.8" />
              </g>
            </g>
          </svg>
        </div>
      </div>

      <div className="landing-content" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal" style={{ maxWidth: '420px', width: '90%' }}>
          
          {/* =======================================================
              3D ANIMALS SURROUNDING LOGIN CARD (Monkey, Ele, Birds, Giraffe, Panda, Sloth, Owl)
              ======================================================= */}

          {/* 3D PEEKING GIRAFFE (Peeks from behind the left of the card) */}
          <div className="giraffe-box" style={{ position: 'absolute', left: '-82px', top: '110px', zIndex: 10 }}>
            <svg width="85" height="150" viewBox="0 0 85 150" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
              {/* Neck */}
              <path d="M 35,150 L 50,70 L 65,150 Z" fill="url(#girNeck)" />
              {/* Spots */}
              <ellipse cx="44" cy="120" rx="5" ry="8" fill="#78350F" opacity="0.6" />
              <ellipse cx="52" cy="95" rx="4" ry="6" fill="#78350F" opacity="0.6" />
              <ellipse cx="46" cy="78" rx="3" ry="4" fill="#78350F" opacity="0.6" />
              
              {/* Head group tracking cursor */}
              <g style={{ transform: `translate(${headX * 0.8}px, ${headY * 0.8}px)`, transition: 'transform 0.12s ease-out' }}>
                {/* Horns */}
                <rect x="42" y="32" width="3" height="16" rx="1.5" fill="#B45309" />
                <circle cx="43.5" cy="30" r="4.5" fill="#D97706" />
                
                <rect x="54" y="32" width="3" height="16" rx="1.5" fill="#B45309" />
                <circle cx="55.5" cy="30" r="4.5" fill="#D97706" />

                {/* Ears */}
                <path d="M 38,48 Q 22,46 36,54 Z" fill="#D97706" />
                <path d="M 62,48 Q 78,46 64,54 Z" fill="#D97706" />

                {/* Head Base */}
                <ellipse cx="50" cy="58" rx="13" ry="17" fill="url(#girHead)" />
                
                {/* Snout */}
                <ellipse cx="50" cy="68" rx="10" ry="8" fill="#FDE68A" />
                <circle cx="47" cy="67" r="1.2" fill="#78350F" />
                <circle cx="53" cy="67" r="1.2" fill="#78350F" />

                {/* Eyes closed on password focus */}
                {isPasswordFocused ? (
                  <g>
                    <path d="M 41,52 Q 44,55 47,52" stroke="#451A03" strokeWidth="2" strokeLinecap="round" fill="none" />
                    <path d="M 53,52 Q 56,55 59,52" stroke="#451A03" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </g>
                ) : (
                  <g>
                    <circle cx="44" cy="52" r="3.5" fill="white" />
                    <g style={{ transform: `translate(${lookX * 0.6}px, ${lookY * 0.6}px)`, transition: 'transform 0.08s ease-out' }}>
                      <circle cx="44" cy="52" r="1.8" fill="#000" />
                    </g>
                    <circle cx="56" cy="52" r="3.5" fill="white" />
                    <g style={{ transform: `translate(${lookX * 0.6}px, ${lookY * 0.6}px)`, transition: 'transform 0.08s ease-out' }}>
                      <circle cx="56" cy="52" r="1.8" fill="#000" />
                    </g>
                  </g>
                )}
              </g>
            </svg>
          </div>

          {/* 3D CUTE PANDA (Sits sitting on the bottom-left edge of the card) */}
          <div className="panda-box" style={{ position: 'absolute', left: '-48px', bottom: '-30px', zIndex: 10 }}>
            <svg width="75" height="75" viewBox="0 0 75 75" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
              {/* Arms holding card edge */}
              <circle cx="20" cy="52" r="8" fill="#111827" />
              <circle cx="55" cy="52" r="8" fill="#111827" />

              {/* Body/Head base */}
              <circle cx="37.5" cy="37.5" r="23" fill="url(#pandaBody)" stroke="#E2E8F0" strokeWidth="0.5" />

              {/* Ears */}
              <circle cx="18" cy="18" r="8.5" fill="#111827" />
              <circle cx="18" cy="18" r="4.5" fill="#1F2937" />
              
              <circle cx="57" cy="18" r="8.5" fill="#111827" />
              <circle cx="57" cy="18" r="4.5" fill="#1F2937" />

              {/* Eye Patches */}
              <ellipse cx="29" cy="36" rx="6.5" ry="8.5" fill="#111827" transform="rotate(-15 29 36)" />
              <ellipse cx="46" cy="36" rx="6.5" ry="8.5" fill="#111827" transform="rotate(15 46 36)" />

              {/* Eyes */}
              {isPasswordFocused ? (
                <g>
                  <path d="M 26,36 Q 29,39 32,36" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                  <path d="M 43,36 Q 46,39 49,36" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                </g>
              ) : (
                <g>
                  <circle cx="29" cy="36" r="3.2" fill="white" />
                  <g style={{ transform: `translate(${lookX * 0.5}px, ${lookY * 0.5}px)`, transition: 'transform 0.08s ease-out' }}>
                    <circle cx="29" cy="36" r="1.5" fill="#000" />
                  </g>
                  
                  <circle cx="46" cy="36" r="3.2" fill="white" />
                  <g style={{ transform: `translate(${lookX * 0.5}px, ${lookY * 0.5}px)`, transition: 'transform 0.08s ease-out' }}>
                    <circle cx="46" cy="36" r="1.5" fill="#000" />
                  </g>
                </g>
              )}

              {/* Snout */}
              <ellipse cx="37.5" cy="46" rx="5" ry="4" fill="#FFFFFF" />
              <polygon points="36,44 39,44 37.5,46" fill="#111827" />
            </svg>
          </div>

          {/* 3D CLINGING SLOTH (Clings lazily on the bottom-right border of the card) */}
          <div className="sloth-box" style={{ position: 'absolute', right: '-45px', bottom: '-28px', zIndex: 10 }}>
            <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
              {/* Hanging body */}
              <circle cx="35" cy="35" r="21" fill="url(#slothBody)" />

              {/* Face mask */}
              <ellipse cx="35" cy="34" rx="14" ry="11" fill="#FEF3C7" />

              {/* Face patches */}
              <ellipse cx="28" cy="34" rx="5" ry="7" fill="#78350F" transform="rotate(-20 28 34)" />
              <ellipse cx="42" cy="34" rx="5" ry="7" fill="#78350F" transform="rotate(20 42 34)" />

              {/* Arms clinging */}
              <path d="M 12,28 C 6,36 10,48 20,44" stroke="#451A03" strokeWidth="5.5" strokeLinecap="round" fill="none" />
              <path d="M 58,28 C 64,36 60,48 50,44" stroke="#451A03" strokeWidth="5.5" strokeLinecap="round" fill="none" />

              {/* Eyes */}
              {isPasswordFocused ? (
                <g>
                  <path d="M 25,34 Q 28,37 31,34" stroke="#FEF3C7" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                  <path d="M 39,34 Q 42,37 45,34" stroke="#FEF3C7" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                </g>
              ) : (
                <g>
                  <circle cx="28" cy="34" r="2.8" fill="white" />
                  <g style={{ transform: `translate(${lookX * 0.4}px, ${lookY * 0.4}px)`, transition: 'transform 0.08s ease-out' }}>
                    <circle cx="28" cy="34" r="1.3" fill="#000" />
                  </g>
                  
                  <circle cx="42" cy="34" r="2.8" fill="white" />
                  <g style={{ transform: `translate(${lookX * 0.4}px, ${lookY * 0.4}px)`, transition: 'transform 0.08s ease-out' }}>
                    <circle cx="42" cy="34" r="1.3" fill="#000" />
                  </g>
                </g>
              )}

              {/* Nose */}
              <polygon points="34,39 36,39 35,41" fill="#451A03" />
            </svg>
          </div>

          {/* 3D MAJESTIC OWL (Perches proud next to the elephant on the top border) */}
          <div className="owl-box" style={{ position: 'absolute', top: '-64px', left: '72px', zIndex: 10 }}>
            <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
              {/* Body */}
              <ellipse cx="35" cy="38" rx="19" ry="22" fill="url(#owlBody)" />

              {/* Chest patch */}
              <path d="M 28,34 Q 35,42 42,34 Q 35,46 28,34 Z" fill="#FEF3C7" opacity="0.8" />

              {/* Horn tufts */}
              <path d="M 22,22 L 14,14 L 26,18 Z" fill="#451A03" />
              <path d="M 48,22 L 56,14 L 44,18 Z" fill="#451A03" />

              {/* Big circular eyes */}
              <circle cx="24" cy="27" r="9.5" fill="#FBBF24" stroke="#78350F" strokeWidth="1" />
              <circle cx="46" cy="27" r="9.5" fill="#FBBF24" stroke="#78350F" strokeWidth="1" />

              {/* Gaze tracking open pupils / sleep slits */}
              {isPasswordFocused ? (
                <g>
                  <path d="M 19,27 L 29,27" stroke="#451A03" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 41,27 L 51,27" stroke="#451A03" strokeWidth="2.5" strokeLinecap="round" />
                </g>
              ) : (
                <g>
                  <g style={{ transform: `translate(${lookX * 0.8}px, ${lookY * 0.8}px)`, transition: 'transform 0.08s ease-out' }}>
                    <circle cx="24" cy="27" r="4.5" fill="#000" />
                    <circle cx="25.5" cy="25.5" r="1.5" fill="white" />
                  </g>
                  <g style={{ transform: `translate(${lookX * 0.8}px, ${lookY * 0.8}px)`, transition: 'transform 0.08s ease-out' }}>
                    <circle cx="46" cy="27" r="4.5" fill="#000" />
                    <circle cx="47.5" cy="25.5" r="1.5" fill="white" />
                  </g>
                </g>
              )}

              {/* Beak */}
              <polygon points="33,31 37,31 35,36" fill="#F59E0B" />
            </svg>
          </div>

          {/* 3D HANGING MONKEY (Hangs and swings from top-left card corner) */}
          <div className="monkey-box" style={{ position: 'absolute', top: '-38px', left: '-38px', zIndex: 10 }}>
            <svg width="70" height="95" viewBox="0 0 70 95" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
              {/* Tail */}
              <path d="M 32,70 C 18,74 12,85 18,91 C 24,96 32,84 28,75" stroke="#78350F" strokeWidth="3" fill="none" strokeLinecap="round" />

              {/* Hanging Arm */}
              <path d="M 32,6 L 32,32" stroke="#78350F" strokeWidth="4.5" strokeLinecap="round" />
              {/* Hand grabbing card edge */}
              <path d="M 29,6 C 29,3 35,3 35,6 Z" fill="#451A03" />

              {/* Torso Body */}
              <ellipse cx="32" cy="50" rx="13" ry="17" fill="url(#monkBody)" />
              <ellipse cx="32" cy="52" rx="9" ry="12" fill="#FDE68A" opacity="0.8" />

              {/* Other Arm waving */}
              <path d="M 44,42 Q 54,34 50,28" stroke="#78350F" strokeWidth="4" strokeLinecap="round" fill="none" />
              
              {/* Legs */}
              <path d="M 23,65 C 18,74 20,84 24,84" stroke="#78350F" strokeWidth="4" strokeLinecap="round" fill="none" />
              <ellipse cx="24" cy="84" rx="4" ry="2.5" fill="#451A03" />
              
              <path d="M 41,65 C 46,74 44,84 40,84" stroke="#78350F" strokeWidth="4" strokeLinecap="round" fill="none" />
              <ellipse cx="40" cy="84" rx="4" ry="2.5" fill="#451A03" />

              {/* Head */}
              <circle cx="32" cy="28" r="11" fill="url(#monkBody)" />
              {/* Large ears */}
              <circle cx="21" cy="28" r="4.5" fill="#78350F" />
              <circle cx="21" cy="28" r="2.5" fill="#FDE68A" />
              <circle cx="43" cy="28" r="4.5" fill="#78350F" />
              <circle cx="43" cy="28" r="2.5" fill="#FDE68A" />

              {/* Peach Face Patch */}
              <ellipse cx="32" cy="29" rx="8" ry="7.5" fill="#FDE68A" />
              <ellipse cx="29" cy="26" rx="3.5" ry="3.5" fill="#FDE68A" />
              <ellipse cx="35" cy="26" rx="3.5" ry="3.5" fill="#FDE68A" />

              {/* Face details with gaze and closed-eyes */}
              {isPasswordFocused ? (
                <g>
                  <path d="M 27,27 Q 29.5,29 32,27" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                  <path d="M 32,27 Q 34.5,29 37,27" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                </g>
              ) : (
                <g>
                  <circle cx="29.5" cy="26" r="2.2" fill="white" />
                  <g style={{ transform: `translate(${lookX * 0.4}px, ${lookY * 0.4}px)` }}>
                    <circle cx="29.5" cy="26" r="1" fill="#111827" />
                  </g>
                  <circle cx="34.5" cy="26" r="2.2" fill="white" />
                  <g style={{ transform: `translate(${lookX * 0.4}px, ${lookY * 0.4}px)` }}>
                    <circle cx="34.5" cy="26" r="1" fill="#111827" />
                  </g>
                </g>
              )}
              <path d="M 30,32 Q 32,34 34,32" stroke="#78350F" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            </svg>
          </div>

          {/* 3D STANDING ELEPHANT (Stands proud on the top border of the card) */}
          <div className="elephant-box" style={{ position: 'absolute', top: '-72px', right: '28px', zIndex: 10 }}>
            <svg width="95" height="80" viewBox="0 0 95 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
              {/* Rear Legs */}
              <rect x="22" y="44" width="10" height="30" rx="3.5" fill="#334155" />
              <rect x="52" y="44" width="10" height="30" rx="3.5" fill="#334155" />
              {/* Tail */}
              <path d="M 12,38 C 6,42 6,55 8,62" stroke="#475569" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <circle cx="8" cy="62" r="2.5" fill="#1E293B" />
              
              {/* Massive 3D Body */}
              <ellipse cx="38" cy="38" rx="28" ry="20" fill="url(#eleBody)" />
              
              {/* Front Legs */}
              <rect x="34" y="44" width="12" height="32" rx="4" fill="url(#eleBody)" />
              <rect x="62" y="44" width="12" height="32" rx="4" fill="url(#eleBody)" />
              {/* Feet claws */}
              <ellipse cx="40" cy="74" rx="6" ry="2.5" fill="#94A3B8" />
              <ellipse cx="68" cy="74" rx="6" ry="2.5" fill="#94A3B8" />

              {/* Head */}
              <circle cx="68" cy="30" r="16" fill="url(#eleBody)" />
              
              {/* Large Floppy Ear (Flaps gently) */}
              <g className="elephant-ear">
                <ellipse cx="58" cy="28" rx="11" ry="14" fill="url(#eleEar)" stroke="#334155" strokeWidth="0.8" />
                <ellipse cx="58" cy="28" rx="7" ry="10" fill="#E2E8F0" opacity="0.15" />
              </g>
              
              {/* Curved majestic trunk pointing upwards */}
              <path d="M 80,32 C 88,36 92,26 89,18 Q 87,14 83,18 C 80,21 82,30 76,32" fill="url(#eleBody)" stroke="#334155" strokeWidth="0.5" />
              
              {/* Small ivory Tusk */}
              <path d="M 76,34 L 84,36 L 78,38 Z" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="0.5" />

              {/* Eye with gaze and closed-eyes */}
              {isPasswordFocused ? (
                <path d="M 70,25 Q 73,28 76,25" stroke="#1E293B" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              ) : (
                <g>
                  <circle cx="73" cy="25" r="3.2" fill="white" stroke="#334155" strokeWidth="0.5" />
                  <g style={{ transform: `translate(${lookX * 0.4}px, ${lookY * 0.4}px)` }}>
                    <circle cx="73" cy="25" r="1.5" fill="#1E293B" />
                  </g>
                </g>
              )}
            </svg>
          </div>

          {/* 3D BIRDS ON A STEM (A leafy branch emerging beside the card with two colorful birds) */}
          <div style={{ position: 'absolute', right: '-75px', top: '140px', zIndex: 10 }}>
            <svg width="100" height="60" viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
              {/* Leafy wood branch */}
              <path d="M 0,42 Q 40,38 90,44" stroke="#78350F" strokeWidth="4" strokeLinecap="round" fill="none" />
              <path d="M 45,40 Q 60,34 75,32" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              
              {/* Green Leaves */}
              <path d="M 25,41 Q 20,32 30,34 Q 35,42 25,41 Z" fill="#10B981" stroke="#047857" strokeWidth="0.5" />
              <path d="M 68,33 Q 72,24 80,28 Q 78,36 68,33 Z" fill="#10B981" stroke="#047857" strokeWidth="0.5" />
              
              {/* Cyan Bird (Bird 1, bobs) */}
              <g className="bird-1" style={{ transformOrigin: '28px 36px' }}>
                <path d="M 16,36 L 8,39 L 12,32 Z" fill="#0891B2" />
                <ellipse cx="24" cy="30" rx="10" ry="8" fill="url(#cyanBird)" />
                <ellipse cx="22" cy="31" rx="6" ry="4" fill="#06B6D4" transform="rotate(-10 22 31)" />
                <circle cx="31" cy="22" r="6.5" fill="url(#cyanBird)" />
                {/* Cyan Bird Eye with gaze and closed-eyes */}
                {isPasswordFocused ? (
                  <path d="M 31,21 Q 32.5,23 34,21" stroke="#000" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                ) : (
                  <g>
                    <circle cx="32.5" cy="20.5" r="2.2" fill="white" />
                    <g style={{ transform: `translate(${lookX * 0.4}px, ${lookY * 0.4}px)` }}>
                      <circle cx="32.5" cy="20.5" r="1" fill="#000" />
                    </g>
                  </g>
                )}
                <polygon points="37,20 42,22 37,24" fill="#F59E0B" />
                <line x1="22" y1="38" x2="22" y2="41" stroke="#4B5563" strokeWidth="1" />
                <line x1="26" y1="38" x2="26" y2="41" stroke="#4B5563" strokeWidth="1" />
              </g>

              {/* Red/Magenta Bird (Bird 2, bobs) */}
              <g className="bird-2" style={{ transformOrigin: '56px 36px' }}>
                <path d="M 44,36 L 36,40 L 40,32 Z" fill="#BE123C" />
                <ellipse cx="52" cy="30" rx="10" ry="8" fill="url(#redBird)" />
                <ellipse cx="50" cy="31" rx="6" ry="4" fill="#E11D48" transform="rotate(-5 50 31)" />
                <circle cx="59" cy="22" r="6.5" fill="url(#redBird)" />
                {/* Red Bird Eye with gaze and closed-eyes */}
                {isPasswordFocused ? (
                  <path d="M 59,21 Q 60.5,23 62,21" stroke="#000" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                ) : (
                  <g>
                    <circle cx="60.5" cy="20.5" r="2.2" fill="white" />
                    <g style={{ transform: `translate(${lookX * 0.4}px, ${lookY * 0.4}px)` }}>
                      <circle cx="60.5" cy="20.5" r="1" fill="#000" />
                    </g>
                  </g>
                )}
                <polygon points="65,20 70,22 65,24" fill="#FBBF24" />
                <line x1="50" y1="38" x2="50" y2="41" stroke="#4B5563" strokeWidth="1" />
                <line x1="54" y1="38" x2="54" y2="41" stroke="#4B5563" strokeWidth="1" />
              </g>
            </svg>
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