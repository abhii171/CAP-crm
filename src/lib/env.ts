import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('❌ Invalid environment variables:')
  console.error(_env.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = _env.data
