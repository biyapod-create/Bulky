import re

with open(r'C:\Users\Allen\Desktop\Bulky\renderer\src\components\Sidebar.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("  const [version, setVersion] = useState('6.1');", "")

content = re.sub(
    r'  useEffect\(\(\) => \{\n    window\.electron\?\.app\?\.getVersion\?\(\)\n      \.then\(v => \{ if \(v\) setVersion\(v\); \}\)\n      \.catch\(\(\) => \{\}\);\n  \}, \[\]\);',
    '',
    content
)

content = re.sub(
    r'\s*\{/\* Workspace status chip \*/\}[\s\S]*?sidebar-workspace-badge[^}]*\}\s*\)\}\s*',
    '\n      ',
    content
)

old_brand = '        <div className="sidebar-brand">'
new_brand_start = "        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', padding: '0 2px' }}>"
if old_brand in content:
    # Find end of sidebar-brand div
    start = content.find(old_brand)
    # Find closing </div> for sidebar-brand (it has nested divs, count them)
    depth = 0
    i = start
    while i < len(content):
        if content[i:i+4] == '<div':
            depth += 1
        elif content[i:i+6] == '</div>':
            depth -= 1
            if depth == 0:
                end = i + 6
                break
        i += 1
    
    new_brand = """        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', padding: '0 2px' }}>
          {!logoError ? (
            <img
              src="./logo.png"
              alt="Bulky"
              style={{ height: isCollapsed ? '30px' : '46px', width: 'auto', maxWidth: isCollapsed ? '36px' : '160px', objectFit: 'contain', display: 'block' }}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={isCollapsed ? 22 : 26} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              {!isCollapsed && <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent)' }}>Bulky</span>}
            </div>
          )}
        </div>"""
    content = content[:start] + new_brand + content[end:]
    print('Brand block replaced')

content = re.sub(
    r'\s*\{!isCollapsed && \(\s*<div className="sidebar-version-pill">[\s\S]*?</div>\s*\)\}\s*',
    '\n      ',
    content
)

with open(r'C:\Users\Allen\Desktop\Bulky\renderer\src\components\Sidebar.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
print('workspace gone:', 'sidebar-workspace-chip' not in content)
print('version gone:', 'sidebar-version-pill' not in content)
print('version state gone:', 'setVersion' not in content)
