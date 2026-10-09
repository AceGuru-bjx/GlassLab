'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { Loader2, LogIn, UserPlus } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Sign-in / sign-up dialog (Phase 2 M3).
 * Registration POSTs /api/auth/register, then signs in via the NextAuth
 * credentials provider with `redirect: false` so the SPA never reloads.
 */
export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail('')
    setName('')
    setPassword('')
    setError(null)
  }

  const credentialsSignIn = async () => {
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    if (!result || result.error) {
      setError('邮箱或密码不正确')
      return
    }
    toast({
      title: mode === 'register' ? '注册成功，已登录' : '登录成功',
      description: email,
    })
    onOpenChange(false)
    reset()
  }

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail.includes('@') || password.length === 0) {
      setError('请输入有效邮箱和密码')
      return
    }
    if (mode === 'register' && password.length < 8) {
      setError('注册密码至少 8 位')
      return
    }

    setPending(true)
    setError(null)
    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: trimmedEmail,
            name: name.trim() || undefined,
            password,
          }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null
          setError(
            res.status === 409
              ? '该邮箱已注册，请直接登录'
              : data?.error ?? '注册失败，请稍后重试'
          )
          return
        }
      }
      await credentialsSignIn()
    } catch {
      setError('网络异常，请稍后重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        onOpenChange(v)
        if (!v) setError(null)
      }}
    >
      <DialogContent className="sm:max-w-sm" data-testid="auth-dialog">
        <DialogHeader>
          <DialogTitle>{mode === 'login' ? '登录 GlassLab' : '注册 GlassLab'}</DialogTitle>
          <DialogDescription>
            {mode === 'login'
              ? '登录后预设仅自己可见，与游客的公共预设隔离。'
              : '注册后保存的预设将归属你的账号。'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault()
            if (!pending) void submit()
          }}
        >
          {mode === 'register' && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name" className="text-xs">
                昵称（可选）
              </Label>
              <Input
                id="auth-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="玻璃艺术家"
                className="h-9 text-sm"
                maxLength={24}
                autoComplete="nickname"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-xs">
              邮箱
            </Label>
            <Input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-9 text-sm"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password" className="text-xs">
              密码
            </Label>
            <Input
              id="auth-password"
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 8 位' : '••••••••'}
              className="h-9 text-sm"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full gap-1.5" disabled={pending} data-testid="auth-submit">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {mode === 'login' ? '登录' : '注册并登录'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            type="button"
            className="ml-1 font-medium text-teal-600 underline decoration-dotted underline-offset-2"
            onClick={() => {
              setMode(m => (m === 'login' ? 'register' : 'login'))
              setError(null)
            }}
            data-testid="auth-switch"
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  )
}
