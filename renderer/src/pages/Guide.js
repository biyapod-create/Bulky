import React from 'react';
import {
  BarChart3,
  BookOpen,
  Mail,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';

const steps = [
  {
    icon: Settings,
    title: '1. Set Up Sending',
    body: 'Open Settings and add one or more SMTP accounts. For better stability, use more than one account, set daily limits, and confirm SPF, DKIM, DMARC, and tracking domain readiness before sending volume.'
  },
  {
    icon: Users,
    title: '2. Prepare Your Audience',
    body: 'Import contacts, create lists, apply tags, and organize your audience before building campaigns. A clean contact structure makes filtering, verification, and campaign targeting much easier.'
  },
  {
    icon: ShieldCheck,
    title: '3. Verify Before Sending',
    body: 'Use Verify Contact to clean your audience. Fast verification is useful for speed, while deeper verification gives you stronger confidence before large sends. Review risky and invalid results before launch.'
  },
  {
    icon: Sparkles,
    title: '4. Build the Message',
    body: 'Use Composer to assemble a campaign, Templates for reusable designs, and AI when you want responsive HTML from a written brief. Use drag-and-drop when you want manual control over every block.'
  },
  {
    icon: Send,
    title: '5. Launch Carefully',
    body: 'Run the Spam Checker, confirm unsubscribe behavior, and review SMTP rotation readiness. Bulky performs best when list quality, deliverability setup, and subject/content quality are all aligned.'
  },
  {
    icon: BarChart3,
    title: '6. Monitor Results Live',
    body: 'The Dashboard and Analytics pages show sent counts, opens, clicks, bounces, unsubscribes, and activity. Keep them open while campaigns run so you can react quickly if performance changes.'
  }
];

const features = [
  {
    title: 'Dashboard',
    body: 'The Dashboard is the operating overview of Bulky. It shows key performance cards, deliverability score, SMTP health, recent campaigns, quick actions, and live activity so you can see the state of the app at a glance.'
  },
  {
    title: 'Campaigns',
    body: 'Use Campaigns to review all campaign records, statuses, schedules, and outcomes. This is where you pause, resume, inspect, or move into campaign-specific analytics after a send has started or completed.'
  },
  {
    title: 'Composer',
    body: 'Composer is where you choose recipients, subject, body, and template source for a campaign. You can send to all contacts, a specific list, or selected individuals depending on the campaign goal.'
  },
  {
    title: 'Contacts',
    body: 'Contacts is the audience management page. Add people manually, import in bulk, delete stale entries, create lists, apply tags, and filter by status so every campaign can target the right audience.'
  },
  {
    title: 'Verify Contact',
    body: 'Verify Contact is for email validation and quality control. Use it on a single contact when checking one address, or on unverified lists when preparing a campaign. This protects deliverability and reduces bounce risk.'
  },
  {
    title: 'Templates',
    body: 'Templates stores reusable email designs. Use drag-and-drop when you want complete manual control, or use AI-generated HTML when you want a faster styled layout from a written prompt or brief.'
  },
  {
    title: 'Spam Checker',
    body: 'Spam Checker analyzes your subject line and content for spam pressure and risky wording. Run it before sending when you want to improve inbox placement and reduce avoidable provider filtering.'
  },
  {
    title: 'Blacklist',
    body: 'Blacklist prevents sending to blocked emails or domains. Use it to permanently exclude addresses that should never receive mail from Bulky again.'
  },
  {
    title: 'Analytics',
    body: 'Analytics is the deep campaign performance page. It shows sent volume, opens, clicks, bounces, unsubscribes, complaints, recent events, and a live chart so you can understand what recipients are doing after a send.'
  },
  {
    title: 'Settings',
    body: 'Settings is where you control SMTP accounts, deliverability, domain health, backup and restore, AI provider setup, warmup options, seed accounts, and general app behavior. It is the operational control center of Bulky.'
  },
  {
    title: 'AI Assistant',
    body: 'The sidebar AI assistant can inspect deliverability, verify contacts, search contacts, create lists, recall memory, generate templates, and guide common workflows conversationally. Use clear commands and it can help move work forward quickly.'
  },
  {
    title: 'SMTP Rotation and Tracking',
    body: 'Bulky rotates across active SMTP accounts when sending campaigns. Tracking is what powers open and click analytics. Always confirm your SMTP accounts are healthy and tracking is running before judging campaign performance.'
  },
  {
    title: 'Inbox Placement',
    body: 'Inbox Placement is for reviewing seeded delivery behavior and whether tracking evidence is being captured properly. Use it after sends when you want a more practical read on placement and engagement visibility.'
  },
  {
    title: 'Automations',
    body: 'Automations are for scheduled or repeatable work. Use them when a task should happen on its own instead of by manual clicks, especially for recurring campaign operations or maintenance workflows.'
  },
  {
    title: 'Drip Sequences',
    body: 'Drip Sequences let you build timed multi-step email journeys. Use them for welcomes, onboarding, nurture flows, reminders, or any campaign where the order and delay between messages matters.'
  },
  {
    title: 'Signup Forms',
    body: 'Signup Forms are for collecting new contacts into Bulky. Set the destination list and default tags before publishing so new contacts land in the correct audience structure from the beginning.'
  }
];

function Guide() {
  return (
    <div className="section-stack">
      <div className="page-header">
        <h1 className="page-title">Bulky Guide</h1>
        <p className="page-subtitle">A practical walkthrough of every major section in Bulky and how to use it effectively.</p>
      </div>

      <div className="guide-hero-card">
        <div className="guide-hero-copy">
          <div className="guide-kicker">
            <BookOpen size={16} />
            Getting Started
          </div>
          <h2>How to use Bulky in the right order</h2>
          <p>
            The safest Bulky flow is simple: connect SMTP, confirm domain health, organize contacts,
            verify the audience, build the message, then launch and monitor performance live.
            Following that order reduces errors and protects deliverability.
          </p>
        </div>
        <div className="guide-hero-stats">
          <div className="guide-stat">
            <span className="guide-stat-value">SMTP</span>
            <span className="guide-stat-label">Connect and test before volume</span>
          </div>
          <div className="guide-stat">
            <span className="guide-stat-value">Verify</span>
            <span className="guide-stat-label">Clean the audience before sending</span>
          </div>
          <div className="guide-stat">
            <span className="guide-stat-value">Track</span>
            <span className="guide-stat-label">Watch opens, clicks, and bounce pressure</span>
          </div>
        </div>
      </div>

      <div className="guide-grid">
        {steps.map(({ icon: Icon, title, body }) => (
          <div key={title} className="guide-card">
            <div className="guide-card-icon">
              <Icon size={20} />
            </div>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="guide-detail-grid">
        <div className="card">
          <h3 className="card-title mb-3">
            <Mail size={18} style={{ marginRight: '8px' }} />
            Best-practice sending flow
          </h3>
          <ol className="guide-list">
            <li>Add and test SMTP accounts.</li>
            <li>Check Domain Health for SPF, DKIM, DMARC, and tracking readiness.</li>
            <li>Import contacts, create lists, and apply tags.</li>
            <li>Run verification, especially on older or imported data.</li>
            <li>Create a template, preview it, and run Spam Checker.</li>
            <li>Launch the campaign and monitor live analytics.</li>
          </ol>
        </div>

        <div className="card">
          <h3 className="card-title mb-3">
            <Sparkles size={18} style={{ marginRight: '8px' }} />
            AI and template tips
          </h3>
          <ol className="guide-list">
            <li>Use AI when you want fast HTML design from a written brief.</li>
            <li>Use drag-and-drop when you want precise manual block control.</li>
            <li>Give the assistant direct requests such as verify contacts, inspect deliverability, or create a template.</li>
            <li>For local privacy, connect LM Studio and load a model before testing AI.</li>
          </ol>
        </div>
      </div>

      <div className="guide-detail-grid">
        <div className="card">
          <h3 className="card-title mb-3">
            <Send size={18} style={{ marginRight: '8px' }} />
            Inbox placement, automations, and drip
          </h3>
          <ol className="guide-list">
            <li>Use Inbox Placement after sends when you want seed-based delivery review.</li>
            <li>Use Automations when a task should run on schedule instead of by manual click.</li>
            <li>Use Drip Sequences for follow-up journeys with timed delays between emails.</li>
            <li>Keep drip cadence conservative while warming up new SMTP accounts.</li>
          </ol>
        </div>

        <div className="card">
          <h3 className="card-title mb-3">
            <Users size={18} style={{ marginRight: '8px' }} />
            Signup forms and contact growth
          </h3>
          <ol className="guide-list">
            <li>Create the destination list before publishing a signup form.</li>
            <li>Apply default tags so new contacts arrive already segmented.</li>
            <li>Review new audience quality regularly after growth campaigns.</li>
            <li>Monitor unsubscribes, complaints, and bounce pressure after expansion.</li>
          </ol>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title mb-4">
          <BookOpen size={18} style={{ marginRight: '8px' }} />
          Full feature breakdown
        </h3>
        <div className="guide-function-grid">
          {features.map((item) => (
            <div key={item.title} className="guide-function-card">
              <h4>{item.title}</h4>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Guide;
