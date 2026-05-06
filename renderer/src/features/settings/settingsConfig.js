import {
  Cloud,
  Server,
  Settings as SettingsIcon,
  Mail,
  Database,
  Shield,
  Key,
  Search,
  Sparkles
} from 'lucide-react';

export const VALID_TABS = ['general', 'smtp', 'accounts', 'deliverability', 'domain', 'seed', 'cloud', 'ai', 'backup'];

export const TAB_GROUPS = [
  {
    label: 'CONNECTION',
    tabs: [
      { id: 'smtp', icon: Server, label: 'SMTP Config' },
      { id: 'accounts', icon: Key, label: 'SMTP Accounts' },
    ]
  },
  {
    label: 'DELIVERABILITY',
    tabs: [
      { id: 'deliverability', icon: Shield, label: 'Deliverability' },
      { id: 'domain', icon: Search, label: 'Domain Health' },
      { id: 'seed', icon: Mail, label: 'Seed Accounts' },
    ]
  },
  {
    label: 'SYSTEM',
    tabs: [
      { id: 'general', icon: SettingsIcon, label: 'General' },
      { id: 'cloud', icon: Cloud, label: 'Account & Sync' },
      { id: 'ai', icon: Sparkles, label: 'AI Assistant', capability: 'aiAssistant' },
      { id: 'backup', icon: Database, label: 'Backup & Restore' },
    ]
  },
];
