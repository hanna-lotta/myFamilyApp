import { create } from 'zustand'

type User = { username: string; color?: string; role?: string } | null

type UserState = {
  user: User
  setUser: (u: User) => void
  logout: () => void
}

export const useUserStore = create<UserState>((set: any) => ({
  user: (localStorage.getItem('jwt') && localStorage.getItem('username'))
    ? {
        username: localStorage.getItem('username')!,
        color: localStorage.getItem('color') || undefined,
        role: localStorage.getItem('role') || undefined
      }
    : null,
  setUser: (u: User) => { 
    if (u?.username) localStorage.setItem('username', u.username)
    else localStorage.removeItem('username')
    if (u?.color) localStorage.setItem('color', u.color)
    else localStorage.removeItem('color')
    if (u?.role) localStorage.setItem('role', u.role)
    else localStorage.removeItem('role')
    set({ user: u })
  },
  logout: () => {
    localStorage.removeItem('username')
    localStorage.removeItem('color')
    localStorage.removeItem('role')
    localStorage.removeItem('jwt')
    set({ user: null })
  }
}))

export default useUserStore
