import { useNavigate } from 'react-router'
import useUserStore from '../store/userStore'
import '../App.css'

const MyProfile = () => {
  const user = useUserStore((s) => s.user)
  const logout = useUserStore((s) => s.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!user) {
    navigate('/login')
    return null
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100dvh',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '600px',
        width: '100%',
        background: 'linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.06))',
        border: '1px solid rgba(255,255,255,.14)',
        boxShadow: '0 12px 28px rgba(0,0,0,.45)',
        backdropFilter: 'blur(14px)',
        borderRadius: '22px',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ 
          fontSize: '2rem', 
          marginBottom: '1rem',
          color: 'rgba(255,255,255,.92)'
        }}>
          Min Profil
        </h1>
        <p style={{ 
          fontSize: '1.2rem', 
          marginBottom: '2rem',
          color: 'rgba(255,255,255,.70)'
        }}>
          Välkommen, <strong>{user.username}</strong>!
        </p>
        {user.color && (
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: user.color,
            margin: '0 auto 2rem',
            border: '2px solid rgba(255,255,255,.2)'
          }} />
        )}
        <button
          onClick={handleLogout}
          style={{
            padding: '0.75rem 2rem',
            borderRadius: '16px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            background: 'rgba(255,255,255,.08)',
            border: '1px solid rgba(255,255,255,.14)',
            boxShadow: '0 10px 22px rgba(0,0,0,.25)',
            color: 'rgba(255,255,255,.92)',
            transition: 'all 0.15s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,.10)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,.08)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          Logga ut
        </button>
      </div>
    </div>
  )
}

export default MyProfile
