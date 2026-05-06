import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Cloud,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Minimize2,
  Search,
  Settings,
  Square,
  User,
  UserPlus,
  X,
  Github,
  LifeBuoy,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { accountPlanOptions } from '../config/accountPlans';

const APP_VERSION_LABEL = 'v6.1.0';

const INITIAL_SIGN_IN = Object.freeze({
  email: '',
  password: ''
});

const INITIAL_SIGN_UP = Object.freeze({
  fullName: '',
  workspaceName: '',
  email: '',
  password: '',
  planId: 'freemium'
});

function AuthInlineNotice({ tone = 'info', children, action }) {
  return (
    <div className={`auth-inline-notice auth-inline-notice-${tone}`}>
      <span>{children}</span>
      {action ? (
        <button type="button" className="auth-inline-action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function FeatureItem({ icon: Icon, title, body }) {
  return (
    <div className="auth-feature-row">
      <div className="auth-feature-icon">
        <Icon size={20} />
      </div>
      <div className="auth-feature-copy">
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
    </div>
  );
}

function PlanCard({ plan, selected, onSelect }) {
  const lines = {
    freemium: ['2 SMTP accounts', '2,000 emails / month', 'No AI or analytics'],
    pro: ['Unlimited SMTP', 'Unlimited emails', 'AI, analytics & tracking'],
    one_off: ['Everything in Pro', '1 year included', 'One-time payment']
  };

  return (
    <button
      type="button"
      className={`auth-plan-option ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(plan.id)}
    >
      <div className="auth-plan-option-top">
        <span className={`auth-radio ${selected ? 'selected' : ''}`} />
        <div className="auth-plan-option-name">{plan.name}</div>
      </div>
      <div className="auth-plan-option-summary">{plan.id === 'freemium' ? 'Local-only starter' : plan.id === 'pro' ? 'Full Bulky + cloud-backed services' : 'Full Bulky + 1 year of cloud services'}</div>
      <ul className="auth-plan-option-list">
        {(lines[plan.id] || []).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </button>
  );
}

export default function DesktopAuthShell({
  accountStatus,
  onAuthenticated,
  onContinueLocal
}) {
  const [activePane, setActivePane] = useState('signIn');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [signInForm, setSignInForm] = useState(INITIAL_SIGN_IN);
  const [signUpForm, setSignUpForm] = useState(INITIAL_SIGN_UP);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isConfigured = !!accountStatus?.configured;
  const pendingConfirmation = accountStatus?.status === 'pending_confirmation';
  const providerReady = isConfigured && !pendingConfirmation;
  const cloudStateLabel = isConfigured ? 'Available when connected' : 'Not connected';

  useEffect(() => {
    if (!pendingConfirmation) {
      return;
    }
    setActivePane('signIn');
    setNotice(`Check ${accountStatus?.account?.email || 'your email'} to confirm the account, then sign in from Bulky.`);
  }, [accountStatus, pendingConfirmation]);

  useEffect(() => {
    if (accountStatus?.lastError) {
      setError(accountStatus.lastError);
    }
  }, [accountStatus?.lastError]);

  const resetMessages = () => {
    setNotice('');
    setError('');
  };

  const statusDescription = useMemo(() => {
    if (accountStatus?.authenticated) {
      return `Signed in as ${accountStatus?.account?.email || 'desktop user'}`;
    }
    if (pendingConfirmation) {
      return 'Email confirmation is pending';
    }
    return isConfigured ? 'Ready for desktop account login' : 'Local-first mode available';
  }, [accountStatus, isConfigured, pendingConfirmation]);

  const handleWindowAction = (action) => {
    if (!window.electron) return;
    if (action === 'minimize') window.electron.minimize?.();
    if (action === 'maximize') window.electron.maximize?.();
    if (action === 'close') window.electron.close?.();
  };

  const handleMockAction = (message) => {
    resetMessages();
    setNotice(message);
  };

  const handleSignIn = async () => {
    resetMessages();
    setSubmitting(true);
    try {
      const result = await window.electron?.account?.signIn?.(signInForm);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.status?.authenticated) {
        window.dispatchEvent(new CustomEvent('bulky:account-status-changed', { detail: result.status }));
        onAuthenticated?.(result.status);
        return;
      }
      setError('Bulky could not complete desktop sign-in.');
    } catch (authError) {
      setError(authError.message || 'Desktop sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    resetMessages();
    if (signUpForm.password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await window.electron?.account?.signUp?.(signUpForm);
      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.pendingConfirmation) {
        setActivePane('signIn');
        setNotice(result.message || 'Desktop account created. Confirm your email, then sign in from Bulky.');
        setSignInForm({
          email: signUpForm.email,
          password: ''
        });
        setConfirmPassword('');
        setShowSignUpPassword(false);
        setShowConfirmPassword(false);
        if (result?.status) {
          window.dispatchEvent(new CustomEvent('bulky:account-status-changed', { detail: result.status }));
        }
        return;
      }

      if (result?.status?.authenticated) {
        window.dispatchEvent(new CustomEvent('bulky:account-status-changed', { detail: result.status }));
        onAuthenticated?.(result.status);
        return;
      }

      setNotice(result?.message || 'Desktop account created. Sign in to continue.');
      setActivePane('signIn');
    } catch (authError) {
      setError(authError.message || 'Desktop sign-up failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-desktop-shell">
      <header className="auth-topbar">
        <div className="auth-topbar-left">
          <div className="auth-mini-brand">
            <img src="./logo.png" alt="Bulky" className="auth-mini-logo" />
            <div className="auth-mini-brand-copy">
              <div className="auth-mini-name">Bulky</div>
              <div className="auth-mini-version">{APP_VERSION_LABEL}</div>
            </div>
          </div>

          <div className="auth-topbar-nav">
            <button type="button" className="auth-chrome-btn muted" onClick={() => handleMockAction('Navigation history is available after you enter the workspace.')}>
              <ArrowLeft size={16} />
            </button>
            <button type="button" className="auth-chrome-btn muted" onClick={() => handleMockAction('Navigation history is available after you enter the workspace.')}>
              <ArrowRight size={16} />
            </button>
          </div>

          <button type="button" className="auth-topbar-search" onClick={() => handleMockAction('Global search becomes active after Bulky enters the main workspace.')}>
            <Search size={16} />
            <span>Search campaigns, contacts, templates...</span>
            <span className="auth-topbar-shortcut">Ctrl K</span>
          </button>
        </div>

        <div className="auth-topbar-right">
          <button type="button" className="auth-chrome-btn" onClick={() => handleMockAction('Startup preferences and account settings open after sign-in or local-mode entry.')}>
            <Settings size={16} />
          </button>
          <button type="button" className="auth-chrome-btn" onClick={() => handleWindowAction('minimize')}>
            <Minimize2 size={16} />
          </button>
          <button type="button" className="auth-chrome-btn" onClick={() => handleWindowAction('maximize')}>
            <Square size={14} />
          </button>
          <button type="button" className="auth-chrome-btn" onClick={() => handleWindowAction('close')}>
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="auth-workspace">
        <aside className="auth-left-rail">
          <div className="auth-left-hero">
            <div className="auth-left-logo-row">
              <img src="./logo.png" alt="Bulky" className="auth-left-logo" />
              <div className="auth-left-wordmark">Bulky</div>
            </div>
            <p className="auth-left-subtitle">
              Local-first bulk email operations with optional cloud-connected features.
            </p>
          </div>

          <div className="auth-feature-stack">
            <FeatureItem icon={ArrowRight} title="BYO SMTP" body="Use your own SMTP accounts. No sending limits from Bulky." />
            <FeatureItem icon={ShieldCheck} title="Your Data Stays Local" body="All data is stored on your device. You're in control." />
            <FeatureItem icon={Cloud} title="Cloud Tracking (Optional)" body="Open, click, and bounce tracking when you connect hybrid services." />
            <FeatureItem icon={Sparkles} title="Campaign Analytics" body="Track performance and engagement with clear, actionable insights." />
            <FeatureItem icon={Bot} title="AI Assistant" body="Smart suggestions for content, subject lines, and workflows." />
            <FeatureItem icon={Mail} title="Signup Forms" body="Create and embed forms to grow your email lists." />
            <FeatureItem icon={LifeBuoy} title="Deliverability Tools" body="Spam checker, blacklist monitor, inbox placement audit, and more." />
          </div>

          <div className="auth-left-note">
            <div className="auth-left-note-title">SMTP sending always uses your own SMTP accounts.</div>
            <div className="auth-left-note-meta">Bulky never becomes your sending provider.</div>
          </div>
        </aside>

        <section className="auth-main-center">
          <div className="auth-main-card">
            <div className="auth-main-tabs">
              <button
                type="button"
                className={`auth-main-tab ${activePane === 'signIn' ? 'active' : ''}`}
                onClick={() => setActivePane('signIn')}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-main-tab ${activePane === 'signUp' ? 'active' : ''}`}
                onClick={() => setActivePane('signUp')}
              >
                Create Account
              </button>
            </div>

            {(notice || error || !isConfigured) ? (
              <div className="auth-main-notices">
                {notice ? <AuthInlineNotice tone="info">{notice}</AuthInlineNotice> : null}
                {error ? <AuthInlineNotice tone="error">{error}</AuthInlineNotice> : null}
                {!isConfigured ? (
                  <AuthInlineNotice
                    tone="warning"
                    action={{ label: 'Continue with Local Mode', onClick: onContinueLocal }}
                  >
                    Connected account services are not configured in this local build yet.
                  </AuthInlineNotice>
                ) : null}
              </div>
            ) : null}

            <div className="auth-main-columns">
              <div className={`auth-pane auth-pane-signin ${activePane === 'signIn' ? 'active' : ''}`}>
                <div className="auth-pane-header">
                  <h2>Welcome back</h2>
                  <p>Sign in to access your campaigns and data.</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <div className="auth-input-wrap">
                    <Mail size={16} />
                    <input
                      type="email"
                      className="form-input auth-input"
                      placeholder="you@example.com"
                      value={signInForm.email}
                      onChange={(event) => setSignInForm((prev) => ({ ...prev, email: event.target.value }))}
                      onFocus={() => setActivePane('signIn')}
                      disabled={submitting || !providerReady}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="auth-input-wrap">
                    <Lock size={16} />
                    <input
                      type={showSignInPassword ? 'text' : 'password'}
                      className="form-input auth-input auth-input-with-toggle"
                      placeholder="Enter your password"
                      value={signInForm.password}
                      onChange={(event) => setSignInForm((prev) => ({ ...prev, password: event.target.value }))}
                      onFocus={() => setActivePane('signIn')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleSignIn();
                        }
                      }}
                      disabled={submitting || !providerReady}
                    />
                    <button type="button" className="auth-input-toggle" onClick={() => setShowSignInPassword((prev) => !prev)}>
                      {showSignInPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="auth-row-inline">
                  <label className="auth-check-row">
                    <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />
                    <span>Remember this device</span>
                  </label>
                  <button type="button" className="auth-link-btn" onClick={() => handleMockAction('Password reset can be enabled after Bulky account recovery is connected.')}>
                    Forgot password?
                  </button>
                </div>

                <button type="button" className="btn btn-primary auth-primary-btn" onClick={handleSignIn} disabled={submitting || !providerReady}>
                  <Lock size={16} />
                  {submitting ? 'Signing In...' : 'Sign In'}
                </button>

                <div className="auth-divider-label">
                  <span>or continue with</span>
                </div>

                <div className="auth-social-row">
                  <button type="button" className="auth-social-btn" onClick={() => handleMockAction('Google sign-in will be enabled when the provider is connected.')}>
                    <span className="auth-social-mark auth-social-google">G</span>
                    Google
                  </button>
                  <button type="button" className="auth-social-btn" onClick={() => handleMockAction('GitHub sign-in will be enabled when the provider is connected.')}>
                    <Github size={18} />
                    GitHub
                  </button>
                </div>

                <div className="auth-security-card">
                  <ShieldCheck size={18} />
                  <div>
                    <div className="auth-security-title">We never store your SMTP passwords.</div>
                    <div className="auth-security-copy">Your credentials are encrypted and stored locally.</div>
                  </div>
                </div>

                <div className="auth-bottom-link">
                  New to Bulky?{' '}
                  <button type="button" className="auth-link-btn inline" onClick={() => setActivePane('signUp')}>
                    Create an account
                  </button>
                </div>
              </div>

              <div className={`auth-pane auth-pane-signup ${activePane === 'signUp' ? 'active' : ''}`}>
                <div className="auth-pane-header">
                  <h2>Create your account</h2>
                  <p>Set up Bulky on your device in seconds.</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <div className="auth-input-wrap">
                    <User size={16} />
                    <input
                      type="text"
                      className="form-input auth-input"
                      placeholder="John Doe"
                      value={signUpForm.fullName}
                      onChange={(event) => setSignUpForm((prev) => ({ ...prev, fullName: event.target.value }))}
                      onFocus={() => setActivePane('signUp')}
                      disabled={submitting || !providerReady}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <div className="auth-input-wrap">
                    <Mail size={16} />
                    <input
                      type="email"
                      className="form-input auth-input"
                      placeholder="you@example.com"
                      value={signUpForm.email}
                      onChange={(event) => setSignUpForm((prev) => ({ ...prev, email: event.target.value }))}
                      onFocus={() => setActivePane('signUp')}
                      disabled={submitting || !providerReady}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="auth-input-wrap">
                    <Lock size={16} />
                    <input
                      type={showSignUpPassword ? 'text' : 'password'}
                      className="form-input auth-input auth-input-with-toggle"
                      placeholder="Create a strong password"
                      value={signUpForm.password}
                      onChange={(event) => setSignUpForm((prev) => ({ ...prev, password: event.target.value }))}
                      onFocus={() => setActivePane('signUp')}
                      disabled={submitting || !providerReady}
                    />
                    <button type="button" className="auth-input-toggle" onClick={() => setShowSignUpPassword((prev) => !prev)}>
                      {showSignUpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <div className="auth-input-wrap">
                    <Lock size={16} />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-input auth-input auth-input-with-toggle"
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      onFocus={() => setActivePane('signUp')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleSignUp();
                        }
                      }}
                      disabled={submitting || !providerReady}
                    />
                    <button type="button" className="auth-input-toggle" onClick={() => setShowConfirmPassword((prev) => !prev)}>
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="auth-plan-heading">
                  <span>Choose a Plan</span>
                  <button type="button" className="auth-link-btn" onClick={() => handleMockAction('Plan comparison and billing activation will open from the profile and billing surfaces.')}>
                    Compare plans
                  </button>
                </div>

                <div className="auth-plan-options">
                  {accountPlanOptions.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      selected={signUpForm.planId === plan.id}
                      onSelect={(planId) => setSignUpForm((prev) => ({ ...prev, planId }))}
                    />
                  ))}
                </div>

                <div className="auth-plan-footnote">
                  SMTP sending always uses your own SMTP accounts.
                </div>

                <button type="button" className="btn btn-primary auth-primary-btn" onClick={handleSignUp} disabled={submitting || !providerReady}>
                  <UserPlus size={16} />
                  {submitting ? 'Creating Account...' : 'Create Account'}
                </button>

                <div className="auth-terms-copy">
                  By creating an account, you agree to the Terms of Use and Privacy Policy.
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="auth-right-rail">
          <div className="auth-ai-card">
            <div className="auth-ai-header">
              <div className="auth-ai-header-title">
                <Sparkles size={16} />
                <span>AI Assistant</span>
              </div>
              <button type="button" className="auth-ai-collapse" onClick={() => handleMockAction('The AI assistant becomes fully interactive after you enter the workspace.')}>
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="auth-ai-body">
              <div className="auth-ai-intro">Hi! I&apos;m your Bulky AI assistant.</div>
              <div className="auth-ai-copy">I can help you with:</div>
              <ul className="auth-ai-list">
                <li>Writing better subject lines</li>
                <li>Improving email content</li>
                <li>Spam checker analysis</li>
                <li>Campaign performance tips</li>
                <li>Setup and best practices</li>
              </ul>
              <button type="button" className="auth-ai-action" onClick={() => handleMockAction('AI guidance becomes interactive after Bulky enters the main app.')}>
                Start a conversation
              </button>
              <div className="auth-ai-subcopy">or ask a quick question</div>
            </div>
          </div>

          <div className="auth-tip-card">
            <div className="auth-tip-title">Tip</div>
            <p>You can access the AI assistant from anywhere in Bulky after sign-in.</p>
          </div>

          <div className="auth-quick-input">
            <input type="text" placeholder="Ask anything..." readOnly />
            <button type="button" onClick={() => handleMockAction('Quick AI prompts become active after the main workspace loads.')}>
              <ArrowRight size={14} />
            </button>
          </div>
        </aside>
      </div>

      <footer className="auth-status-strip">
        <div className="auth-status-item">
          <span className="auth-status-dot success" />
          <div>
            <div className="auth-status-title">Local Mode</div>
            <div className="auth-status-copy">All data stored on this device</div>
          </div>
        </div>
        <div className="auth-status-item">
          <ShieldCheck size={16} />
          <div>
            <div className="auth-status-title">Encrypted Local Session</div>
            <div className="auth-status-copy">{rememberDevice ? 'Your data is protected' : 'Session stays device-bound'}</div>
          </div>
        </div>
        <div className="auth-status-item">
          <Cloud size={16} />
          <div>
            <div className="auth-status-title">Connected Features</div>
            <div className="auth-status-copy">{cloudStateLabel}</div>
          </div>
        </div>
        <div className="auth-status-item">
          <Sparkles size={16} />
          <div>
            <div className="auth-status-title">Tracking</div>
            <div className="auth-status-copy">Available when connected</div>
          </div>
        </div>
        <button type="button" className="auth-status-button" onClick={() => handleMockAction(statusDescription)}>
          System Status
        </button>
      </footer>
    </div>
  );
}
