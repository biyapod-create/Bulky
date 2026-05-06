import Dashboard from '../pages/Dashboard';
import Contacts from '../pages/Contacts';
import Campaigns from '../pages/Campaigns';
import Composer from '../pages/Composer';
import Templates from '../pages/Templates';
import Verify from '../pages/Verify';
import SpamChecker from '../pages/SpamChecker';
import Blacklist from '../pages/Blacklist';
import Settings from '../pages/Settings';
import Analytics from '../pages/Analytics';
import EngagementDashboard from '../pages/EngagementDashboard';
import Automations from '../pages/Automations';
import DripSequences from '../pages/DripSequences';
import SignupForms from '../pages/SignupForms';
import InboxPlacement from '../pages/InboxPlacement';
import Guide from '../pages/Guide';
import {
  LayoutDashboard, Users, Send, FileEdit, FileText,
  CheckCircle, ShieldAlert, Ban, Settings as SettingsIcon, Mail,
  Zap, Droplets, Leaf, Inbox, BarChart3
} from 'lucide-react';

export const SETTINGS_PATH = '/settings';

export const pageRegistry = [
  { path: '/', Component: Dashboard, name: 'Dashboard' },
  { path: '/campaigns', Component: Campaigns, name: 'Campaigns' },
  { path: '/composer', Component: Composer, name: 'Composer' },
  { path: '/contacts', Component: Contacts, name: 'Contacts' },
  { path: '/verify', Component: Verify, name: 'Verify Contact' },
  { path: '/templates', Component: Templates, name: 'Templates' },
  { path: '/spam-checker', Component: SpamChecker, name: 'Spam Checker' },
  { path: '/blacklist', Component: Blacklist, name: 'Blacklist' },
  { path: '/automations', Component: Automations, name: 'Automations' },
  { path: '/drip', Component: DripSequences, name: 'Drip Sequences' },
  { path: '/signup-forms', Component: SignupForms, name: 'Signup Forms' },
  { path: SETTINGS_PATH, Component: Settings, name: 'Settings' },
  { path: '/inbox-placement', Component: InboxPlacement, name: 'Inbox Placement' },
  { path: '/guide', Component: Guide, name: 'Bulky Guide' },
  { path: '/engagement', Component: EngagementDashboard, name: 'Engagement', capability: 'analytics' },
];

export const analyticsPage = {
  pathPrefix: '/analytics/',
  Component: Analytics,
  name: 'Analytics',
  capability: 'analytics'
};

export const navGroups = [
  {
    label: 'SEND',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/campaigns', icon: Send, label: 'Campaigns' },
      { path: '/composer', icon: FileEdit, label: 'Composer' },
    ]
  },
  {
    label: 'LISTS & CONTACTS',
    items: [
      { path: '/contacts', icon: Users, label: 'Contacts' },
      { path: '/templates', icon: FileText, label: 'Templates' },
    ]
  },
  {
    label: 'TOOLS',
    items: [
      { path: '/verify', icon: CheckCircle, label: 'Verify' },
      { path: '/spam-checker', icon: ShieldAlert, label: 'Spam Checker' },
      { path: '/inbox-placement', icon: Inbox, label: 'Inbox Placement' },
      { path: '/blacklist', icon: Ban, label: 'Blacklist' },
    ]
  },
  {
    label: 'AUTOMATION',
    items: [
      { path: '/automations', icon: Zap, label: 'Automations' },
      { path: '/drip', icon: Droplets, label: 'Drip Sequences' },
      { path: '/signup-forms', icon: Leaf, label: 'Signup Forms' },
    ]
  },
  {
    label: 'REPORTS',
    items: [
      { path: '/engagement', icon: BarChart3, label: 'Analytics', capability: 'analytics' },
    ]
  },
];

export const navItems = [
  ...navGroups.flatMap((group) => group.items),
  { path: SETTINGS_PATH, icon: SettingsIcon, label: 'Settings' }
];

export const pageLabelMap = {
  '/': 'Dashboard',
  '/campaigns': 'Campaigns',
  '/composer': 'Composer',
  '/contacts': 'Contacts',
  '/verify': 'Verify Contact',
  '/templates': 'Templates',
  '/spam-checker': 'Spam Checker',
  '/blacklist': 'Blacklist',
  '/settings': 'Settings',
  '/inbox-placement': 'Inbox Placement',
  '/automations': 'Automations',
  '/drip': 'Drip Sequences',
  '/signup-forms': 'Signup Forms',
  '/engagement': 'Analytics',
  '/guide': 'Bulky Guide'
};

export function getPageLabel(activePage) {
  if (String(activePage || '').startsWith(analyticsPage.pathPrefix)) {
    return analyticsPage.name;
  }
  return pageLabelMap[activePage] || 'Workspace';
}

export function isAnalyticsRoute(activePage) {
  return String(activePage || '').startsWith(analyticsPage.pathPrefix);
}

export function getAnalyticsCampaignId(activePage) {
  if (!isAnalyticsRoute(activePage)) {
    return null;
  }
  const campaignId = String(activePage || '').split(analyticsPage.pathPrefix)[1];
  return campaignId || null;
}

export const sidebarBrandFallbackIcon = Mail;
