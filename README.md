# Bulky Email Sender

Professional bulk email software for desktop use, with local data ownership, SMTP rotation, tracking, verification, and template building.

## Current Release

- Version: `6.0.4`
- Platform: Windows desktop app
- Installer: available from the GitHub Releases page

## Main Capabilities

- SMTP account management with rotation and daily limits
- Campaign composer with manual, list, and all-contact targeting
- Contact import, filtering, tagging, and blacklist handling
- Email verification with bulk and single-contact workflows
- Spam checking and content improvement tools
- Template builder, HTML editor, and preview tools
- Open, click, and unsubscribe tracking
- Local analytics and campaign performance monitoring

## Development

```bash
npm install
cd renderer && npm install && cd ..
npm run dev
```

Production build:

```bash
npm run build
```

Smoke checks:

```bash
npm test -- --runInBand
npm run smoke
npm run smoke:packaged
```

## Project Structure

```text
Bulky/
|-- main.js
|-- preload.js
|-- database/
|-- ipc/
|-- renderer/
|-- scripts/
|-- services/
`-- assets/
```

## Runtime Note

`BULKY_USER_DATA_DIR` can be set to override where Bulky stores its local database and logs.

Example in PowerShell:

```powershell
$env:BULKY_USER_DATA_DIR = "C:\BulkyData"
npm run dev
```

## License

MIT. See [LICENSE](LICENSE).
