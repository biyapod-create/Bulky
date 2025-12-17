# 📧 Bulky Email Sender

<p align="center">
  <img src="assets/icon.ico" alt="Bulky Logo" width="128"/>
</p>

<p align="center">
  <strong>Professional Bulk Email Solution - No Subscriptions, No Limits</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-blue.svg" alt="Version"/>
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey.svg" alt="Platform"/>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"/>
</p>

---

## ✨ Features

- **📬 Bulk Email Sending** - Send thousands of emails with your own SMTP server
- **👥 Contact Management** - Import/export contacts, create lists, manage subscribers
- **📝 Email Composer** - Rich HTML editor with live preview
- **📋 Template System** - Save and reuse email templates
- **✅ Email Verification** - Validate email addresses before sending
- **🛡️ Spam Checker** - Analyze content for spam triggers before sending
- **⚡ Batch Processing** - Configurable batch sizes with delays to avoid rate limits
- **📊 Campaign Tracking** - Monitor sent, failed, and pending emails
- **🌓 Light/Dark Mode** - Choose your preferred theme

---

## 📸 Screenshots

*Screenshots coming soon*

---

## 🚀 Installation

### Option 1: Download Installer (Recommended)
1. Go to [Releases](https://github.com/biyapod-create/Bulky/releases)
2. Download `Bulky Email Sender Setup.exe`
3. Run the installer and follow the prompts

### Option 2: Build from Source
```bash
# Clone the repository
git clone https://github.com/biyapod-create/Bulky.git
cd Bulky

# Install dependencies
npm install
cd renderer && npm install && cd ..

# Run in development mode
npm run dev

# Build for production
npm run build
```

---

## ⚙️ Configuration

### SMTP Setup

Bulky works with any SMTP server. Here are common configurations:

| Provider | Host | Port | SSL/TLS |
|----------|------|------|---------|
| cPanel/Webmail | mail.yourdomain.com | 587 | No |
| Gmail | smtp.gmail.com | 587 | No |
| Outlook | smtp-mail.outlook.com | 587 | No |
| Custom | Your SMTP server | 587/465 | Depends |

> **Note:** For Gmail, you'll need to use an [App Password](https://support.google.com/accounts/answer/185833)

### Deliverability Settings (Optional)

To improve inbox delivery rates:
- **Reply-To Email** - Where replies should go
- **Unsubscribe Email/URL** - Adds List-Unsubscribe header (recommended for bulk sending)

---

## 📖 Usage Guide

### 1. Configure SMTP
Go to **Settings** → Enter your SMTP server details → **Test Connection**

### 2. Add Contacts
Go to **Contacts** → **Import CSV** or add manually

### 3. Create Campaign
Go to **Campaigns** → **New Campaign** → Select list → Configure batch settings

### 4. Compose Email
Use the **Composer** to write your email with the rich text editor

### 5. Send!
Start your campaign and monitor progress in real-time

---

## 🛡️ Spam Prevention Tips

1. **Set up SPF/DKIM** - Configure DNS records with your domain host
2. **Use descriptive subjects** - Avoid "Test" or spammy words
3. **Add unsubscribe option** - Required by Gmail for bulk senders
4. **Avoid spam triggers** - FREE, URGENT, ALL CAPS, excessive punctuation
5. **Warm up gradually** - Start with small batches (10-20/day)
6. **Use your own domain** - Avoid sending from gmail.com or yahoo.com

---

## 🏗️ Tech Stack

- **Electron** - Cross-platform desktop framework
- **React** - Frontend UI
- **SQLite** - Local database (sql.js)
- **Nodemailer** - Email sending
- **Lucide React** - Icons

---

## 📁 Project Structure

```
Bulky/
├── main.js              # Electron main process
├── preload.js           # Context bridge for IPC
├── package.json         # Dependencies & build config
├── database/
│   └── db.js            # SQLite database operations
├── services/
│   ├── emailService.js  # Email sending logic
│   ├── verificationService.js  # Email validation
│   └── spamService.js   # Spam checking
├── renderer/
│   └── src/
│       ├── pages/       # React page components
│       ├── components/  # Reusable UI components
│       └── index.css    # Styles
└── assets/
    ├── icon.ico         # App icon
    └── license.txt      # License file
```

---

## 📝 Changelog

### v2.0.0 (Current)
- ✅ Added spam deliverability improvements (plain text + HTML)
- ✅ Added List-Unsubscribe header support
- ✅ Added Reply-To email configuration
- ✅ Fixed Spam Checker page styling
- ✅ Light mode now default
- ✅ Logo aligned to left in sidebar
- ✅ Code cleanup and optimizations

### v1.0.0
- 🎉 Initial release
- Email composer with HTML editor
- Contact management with CSV import
- Campaign system with batch processing
- Email verification
- Spam checker
- Template system

---

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Allen Daniel (AllenRetro)**
- GitHub: [@biyapod-create](https://github.com/biyapod-create)

---

<p align="center">Made with ❤️ by AllenRetro</p>
