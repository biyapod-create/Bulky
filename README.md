# 📧 Bulky Email Sender

**Professional Bulk Email Solution - No Subscriptions, No Limits**

Bulky is a powerful desktop application for sending bulk emails without the recurring costs of SaaS platforms. Built as a modern alternative to SendBlaster, it offers a clean interface and advanced features for email marketers.

![Bulky Email Sender](https://img.shields.io/badge/version-3.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### Core Features
- 📨 **Unlimited Email Sending** - No monthly limits or quotas
- 📋 **Contact Management** - Import, organize, and manage contact lists
- 🎨 **HTML Email Composer** - Rich text editor with template support
- 📊 **Campaign Tracking** - Monitor sent, failed, opened, and clicked emails
- ✅ **Email Verification** - Validate emails before sending
- 🛡️ **Spam Checker** - Analyze content for spam triggers

### New in v3.0
- 🪄 **Spam Auto-Fix** - One-click fixes for spam trigger words
- 📥 **Multi-Format Import** - CSV, Excel, JSON, TXT support with smart parsing
- 🏷️ **Contact Tags & Filters** - Organize with tags, search, and filter
- 🔄 **Smart Verification Workflow** - Delete invalid, export valid, add to blacklist
- 🚫 **Blacklist Management** - Block emails/domains, auto-block bounces
- 📧 **SMTP Rotation** - Multiple accounts with daily limits and load balancing
- 📈 **Advanced Personalization** - Conditionals, fallbacks, custom fields
- 📊 **Enhanced Analytics** - Open tracking, click tracking, engagement scores

## 🚀 Installation

### Option 1: Download Installer
Download the latest release from the [Releases](https://github.com/biyapod-create/Bulky/releases) page.

### Option 2: Build from Source
```bash
# Clone repository
git clone https://github.com/biyapod-create/Bulky.git
cd Bulky

# Install dependencies (both root and renderer)
npm install
cd renderer && npm install && cd ..

# Run in development mode
npm run dev

# Build for production
npm run build
```

## 📧 SMTP Configuration

Configure your SMTP server in Settings. Common providers:

| Provider | Host | Port | Secure |
|----------|------|------|--------|
| cPanel Webmail | mail.yourdomain.com | 465 | Yes |
| Gmail | smtp.gmail.com | 587 | No |
| Outlook | smtp.office365.com | 587 | No |
| SendGrid | smtp.sendgrid.net | 587 | No |
| Mailgun | smtp.mailgun.org | 587 | No |


## 📝 Personalization Tokens

Use these placeholders in your emails for personalization:

### Basic Tokens
| Token | Description |
|-------|-------------|
| `{{firstName}}` | Contact's first name |
| `{{lastName}}` | Contact's last name |
| `{{fullName}}` | First + Last name |
| `{{email}}` | Email address |
| `{{company}}` | Company name |
| `{{phone}}` | Phone number |
| `{{customField1}}` | Custom field 1 |
| `{{customField2}}` | Custom field 2 |

### Date/Time Tokens
| Token | Description |
|-------|-------------|
| `{{date}}` | Current date |
| `{{year}}` | Current year |
| `{{month}}` | Current month name |
| `{{dayOfWeek}}` | Day of week |

### Advanced Tokens
| Token | Description |
|-------|-------------|
| `{{firstName \| "Friend"}}` | Fallback if empty |
| `{{firstName:upper}}` | UPPERCASE |
| `{{firstName:capitalize}}` | Capitalize |
| `{{uniqueCode}}` | Random unique code |

### Conditional Content
```html
{{#if company}}
Thanks for representing {{company}}!
{{else}}
Thanks for joining us!
{{/if}}
```

## 🛡️ Spam Prevention Tips

1. **Avoid spam trigger words**: FREE, URGENT, BUY NOW, CLICK HERE
2. **Keep subject lines under 50 characters**
3. **Maintain 80/20 text-to-image ratio**
4. **Include unsubscribe link** (required for bulk sending)
5. **Use List-Unsubscribe header** (Settings > Deliverability)
6. **Verify emails before sending** to reduce bounce rate
7. **Warm up new SMTP accounts** gradually

## 🔧 Tech Stack

- **Electron** - Cross-platform desktop framework
- **React** - Modern UI library
- **SQLite (sql.js)** - Local database
- **Nodemailer** - Email sending engine

## 📁 Project Structure

```
Bulky/
├── main.js              # Electron main process
├── preload.js           # Context bridge
├── database/
│   └── db.js            # SQLite database
├── services/
│   ├── emailService.js  # Email sending & tracking
│   ├── verificationService.js
│   └── spamService.js   # Spam check & auto-fix
├── renderer/
│   ├── src/
│   │   ├── pages/       # React pages
│   │   ├── components/  # Reusable components
│   │   └── App.js
│   └── public/
└── assets/
```

## 📜 Changelog

### v3.0.0 (Latest)
- ✨ Spam auto-fix with word replacements
- ✨ Multi-format contact import (CSV, Excel, JSON, TXT)
- ✨ Contact tags, filters, and bulk actions
- ✨ Smart verification workflow
- ✨ Blacklist & unsubscribe management
- ✨ SMTP rotation with daily limits
- ✨ Advanced personalization (conditionals, fallbacks)
- ✨ Enhanced dashboard with new metrics

### v2.0.0
- Complete UI redesign with light/dark themes
- Improved spam checker
- Better deliverability headers
- Email verification system

### v1.0.0
- Initial release
- Basic email sending
- Contact management
- Template system

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

## 👤 Author

**Allen Daniel** (AllenRetro)
- GitHub: [@biyapod-create](https://github.com/biyapod-create)

---

Made with ❤️ for email marketers who want freedom from subscriptions.
