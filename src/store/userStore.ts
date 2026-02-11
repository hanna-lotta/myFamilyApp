import { create } from 'zustand'

type User = { username: string; color?: string } | null

type UserState = {
  user: User
  setUser: (u: User) => void
  logout: () => void
}

export const useUserStore = create<UserState>((set: any) => ({
  user: localStorage.getItem('username')
    ? { username: localStorage.getItem('username')! }
    : null,
  setUser: (u: User) => { 
    if (u?.username) localStorage.setItem('username', u.username) //spara username i localstorage
    else localStorage.removeItem('username')
    set({ user: u }) //uppdatera store
  },
  logout: () => {
    localStorage.removeItem('username')
    localStorage.removeItem('jwt')
    set({ user: null }) //uppdatera store
  }
}))

export default useUserStore
