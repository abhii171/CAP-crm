import fs from 'fs'
import path from 'path'

const STORAGE_DIR = path.join(process.cwd(), '.demo-store')

function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    try {
      fs.mkdirSync(STORAGE_DIR, { recursive: true })
    } catch {}
  }
}

export function loadDemoData<T>(key: string, fallback: T): T {
  try {
    ensureDir()
    const filePath = path.join(STORAGE_DIR, `${key}.json`)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(content)
      if (parsed !== undefined && parsed !== null) {
        return parsed as T
      }
    }
  } catch (err) {
    console.error(`Failed to load demo data for ${key}:`, err)
  }
  return fallback
}

export function saveDemoData<T>(key: string, data: T): void {
  try {
    ensureDir()
    const filePath = path.join(STORAGE_DIR, `${key}.json`)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error(`Failed to save demo data for ${key}:`, err)
  }
}

